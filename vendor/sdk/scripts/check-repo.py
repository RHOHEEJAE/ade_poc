#!/usr/bin/env python3
"""레포 규칙 검사.

표준 라이브러리만 쓴다. CI(.gitlab-ci.yml)와 로컬에서 같은 명령으로 돈다.

    python3 scripts/check-repo.py [--root 경로] [--skip-git]

규칙은 AGENTS.md의 "프로젝트 설정" 절과 "브랜치, 커밋, PR" 절을 따른다.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

REQUIRED_PATHS = (
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    ".gitignore",
    "docs/specs",
    "docs/plans",
)


def check_required_files(root: Path) -> list[str]:
    """필수 파일·디렉터리가 없으면 경로마다 실패 메시지를 낸다."""
    return [f"없음: {rel}" for rel in REQUIRED_PATHS if not (root / rel).exists()]


SETTINGS_HEADING = "## 프로젝트 설정"
PLACEHOLDER_CHARS = ("〈", "〉")

# 검사기가 읽는 설정 절 항목 이름. 이 이름이 AGENTS.md 와의 계약이다.
KEY_PROJECT_KEY = "Plane 프로젝트 키"
KEY_BASE_BRANCH = "기준 브랜치"
KEY_BRANCH_TYPES = "브랜치 타입"
KEY_EMAIL_DOMAIN = "커밋 이메일 도메인"
KEY_EXCLUDED = "검사 제외"

# 설정 절 '검사 제외'로 끌 수 있는 검사 이름. 필수 파일과 설정 절 검사는 끌 수 없다.
EXCLUDABLE_CHECKS = ("템플릿 잔여물", "브랜치 이름", "커밋 메시지", "커밋 이메일")
# 기준 브랜치 값은 git 인자로 쓰이므로 옵션처럼 보이는 값(`-`로 시작)과 이상한 문자를 막는다.
REF_NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]*")


def parse_list(value: str) -> tuple[str, ...]:
    """'a, b, c' 형태의 설정 값을 튜플로. 빈 항목은 버린다."""
    return tuple(item.strip() for item in value.split(",") if item.strip())


def parse_domains(value: str) -> tuple[str, ...]:
    """이메일 도메인 목록. 앞에 붙인 '@'는 벗긴다('@company.com'도 허용)."""
    return tuple(d.lstrip("@") for d in parse_list(value))


def settings_section(agents_text: str) -> str | None:
    """'## 프로젝트 설정' 절의 본문. 다음 '## ' 제목 전까지. 절이 없으면 None."""
    lines = agents_text.splitlines()
    in_fence = False
    for i, line in enumerate(lines):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence or line.strip() != SETTINGS_HEADING:
            continue
        body = []
        for following in lines[i + 1:]:
            if following.startswith("## "):
                break
            body.append(following)
        return "\n".join(body)
    return None


def parse_settings(section: str) -> dict[str, str]:
    """'- 이름: 값' 줄을 dict로 만든다. 값의 콜론은 첫 콜론 이후 전부 값이다."""
    settings: dict[str, str] = {}
    for line in section.splitlines():
        m = re.match(r"^\s*-\s*([^:]+?)\s*:\s*(.*?)\s*$", line)
        if m:
            settings[m.group(1)] = m.group(2)
    return settings


def duplicate_keys(section: str) -> list[str]:
    """'- 이름: 값' 줄에서 두 번 이상 나온 이름."""
    seen: dict[str, int] = {}
    for line in section.splitlines():
        m = re.match(r"^\s*-\s*([^:]+?)\s*:", line)
        if m:
            seen[m.group(1)] = seen.get(m.group(1), 0) + 1
    return [name for name, n in seen.items() if n > 1]


def load_settings(root: Path) -> dict[str, str]:
    """AGENTS.md의 설정 절을 읽는다. 파일이나 절이 없으면 빈 dict."""
    agents = root / "AGENTS.md"
    if not agents.is_file():
        return {}
    section = settings_section(agents.read_text(encoding="utf-8-sig"))
    return parse_settings(section) if section is not None else {}


def check_settings(root: Path) -> list[str]:
    """설정 절 검사. 절이 있고, 꺾쇠가 없고, 프로젝트 키·기준 브랜치·이메일 도메인 형식이 맞고,
    항목 중복이 없고, 검사 제외 이름이 유효해야 한다. 플레이스홀더가 남은 값은 형식을 따지지 않는다."""
    agents = root / "AGENTS.md"
    if not agents.is_file():
        return ["AGENTS.md 없음"]
    section = settings_section(agents.read_text(encoding="utf-8-sig"))
    if section is None:
        return [f"AGENTS.md에 '{SETTINGS_HEADING}' 절이 없다"]
    failures = [
        f"플레이스홀더가 남아 있다: {line.strip()}"
        for line in section.splitlines()
        if any(ch in line for ch in PLACEHOLDER_CHARS)
    ]
    settings = parse_settings(section)
    def unfilled(value: str) -> bool:
        return any(ch in value for ch in PLACEHOLDER_CHARS)

    key = settings.get(KEY_PROJECT_KEY, "")
    if not unfilled(key) and not re.fullmatch(r"[A-Z][A-Z0-9]*", key):
        failures.append(f"{KEY_PROJECT_KEY}는 대문자 영문으로 시작하는 영문·숫자여야 한다: '{key}'")
    unknown = [n for n in parse_list(settings.get(KEY_EXCLUDED, "")) if n not in EXCLUDABLE_CHECKS]
    if unknown:
        failures.append(f"{KEY_EXCLUDED}에 없는 검사 이름: {', '.join(unknown)} (가능: {', '.join(EXCLUDABLE_CHECKS)})")
    base = settings.get(KEY_BASE_BRANCH, "main")
    if not REF_NAME_RE.fullmatch(base):
        failures.append(f"{KEY_BASE_BRANCH} 값이 브랜치 이름 형식이 아니다: '{base}'")
    bad_domains = [d for d in parse_domains(settings.get(KEY_EMAIL_DOMAIN, "")) if not unfilled(d) and ("@" in d or " " in d)]
    if bad_domains:
        failures.append(f"{KEY_EMAIL_DOMAIN}은 도메인만 적는다(예: company.com): {', '.join(bad_domains)}")
    dupes = duplicate_keys(section)
    if dupes:
        failures.append(f"설정 항목 중복: {', '.join(dupes)}")
    return failures


# ── 템플릿 수명주기 ────────────────────────────────────────────────────────
# 아래는 템플릿 레포 자신(면제)과 복제 직후(잔여물)에만 의미가 있다. 프로젝트 검사와 무관하므로
# 나중에 빼려면 이 블록과 run_checks의 참조 두 곳만 지우면 된다.

TEMPLATE_ENV_VAR = "CHECK_REPO_TEMPLATE"  # 템플릿 레포 자신에게만 설정. 포크·복제본은 상속하지 않는다.
# 템플릿 자신의 문서는 이 디렉터리에 모여 있고 복제 후 통째로 지운다.
TEMPLATE_DIR = "_template-only"
# 루트 README 서식의 첫 줄. 채운 뒤 지운다.
README_TEMPLATE_MARKER = "<!-- template-readme:"


def is_template_repo() -> bool:
    """환경 변수 CHECK_REPO_TEMPLATE 가 1/true/yes 이면 템플릿 레포 자신이다."""
    return os.environ.get(TEMPLATE_ENV_VAR, "").strip().lower() in ("1", "true", "yes")


def check_template_leftovers(root: Path) -> list[str]:
    """복제한 레포에 템플릿 전용 디렉터리와 README 서식 안내 주석이 남아 있으면 안 된다."""
    failures = []
    if (root / TEMPLATE_DIR).exists():
        failures.append(f"템플릿 전용 디렉터리가 남아 있다: {TEMPLATE_DIR}/")
    readme = root / "README.md"
    if readme.is_file() and README_TEMPLATE_MARKER in readme.read_text(encoding="utf-8-sig"):
        failures.append("README.md 서식의 안내 주석이 남아 있다. 채운 뒤 첫 줄을 지운다")
    return failures


# ── 프로젝트 검사: 브랜치·커밋 ───────────────────────────────────────────────

DEFAULT_BRANCH_TYPES = ("feature", "bug", "chore", "docs")
MISSING_KEY = f"AGENTS.md 프로젝트 설정 절에 {KEY_PROJECT_KEY}가 없다"


def parse_branch_types(value: str) -> tuple[str, ...]:
    """설정 절의 '브랜치 타입: a, b, c' 값을 튜플로. 비어 있으면 기본값."""
    return parse_list(value) or DEFAULT_BRANCH_TYPES


def check_branch(branch: str, plane_key: str, branch_types: tuple[str, ...]) -> list[str]:
    """브랜치 이름은 <type>/<키>-<번호>. type은 설정 절의 브랜치 타입 중 하나."""
    if not plane_key:
        return [MISSING_KEY]
    pattern = "|".join(re.escape(t) for t in branch_types)
    if re.fullmatch(rf"(?:{pattern})/{re.escape(plane_key)}-\d+", branch):
        return []
    return [f"브랜치 이름 '{branch}'가 <{'|'.join(branch_types)}>/{plane_key}-<번호> 형식이 아니다"]


def check_commits(commits: list[tuple[str, str, str]], plane_key: str) -> list[str]:
    """커밋 제목은 '<키>-<번호>: '로 시작해야 한다. 입력은 (해시, 이메일, 제목) 목록."""
    if not plane_key:
        return [MISSING_KEY]
    pattern = re.compile(rf"{re.escape(plane_key)}-\d+: ")
    return [
        f"{sha[:7]} '{subject}' 가 '{plane_key}-<번호>: '로 시작하지 않는다"
        for sha, _email, subject in commits
        if not pattern.match(subject)
    ]


def check_commit_emails(commits: list[tuple[str, str, str]], domains: tuple[str, ...]) -> list[str]:
    """커밋 작성자 이메일은 허용 도메인 중 하나로 끝나야 한다. 대소문자는 구분하지 않는다."""
    suffixes = tuple("@" + d.lower() for d in domains)
    allowed = ", ".join(suffixes)
    return [
        f"{sha[:7]} {email} 가 {allowed} 중 하나가 아니다"
        for sha, email, _subject in commits
        if not email.lower().endswith(suffixes)
    ]


SHOW_GIT_ERRORS = True  # git 실패 사유를 stderr로 보여준다. 테스트는 꺼서 출력을 깨끗하게 둔다.


def git_output(root: Path, *args: str) -> str | None:
    """git 명령의 stdout. git이 없거나 명령이 실패하면 None."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        )
    except OSError:
        return None
    except subprocess.CalledProcessError as e:
        if SHOW_GIT_ERRORS and e.stderr and e.stderr.strip():
            print(f"git {args[0]}: {e.stderr.strip()}", file=sys.stderr)
        return None
    return result.stdout.strip()


def detect_branch(root: Path) -> str | None:
    """MR 소스 브랜치, 커밋 브랜치, 로컬 현재 브랜치 순. 없으면 None."""
    for var in ("CI_MERGE_REQUEST_SOURCE_BRANCH_NAME", "CI_COMMIT_BRANCH"):
        if os.environ.get(var):
            return os.environ[var]
    return git_output(root, "branch", "--show-current") or None


def list_commits(root: Path, base: str) -> list[tuple[str, str, str]] | None:
    """기준 브랜치 이후 커밋의 (해시, 작성자 이메일, 제목). origin/<base>가 없으면 <base>. 둘 다 없으면 None.

    머지 커밋은 제외한다.
    """
    if not REF_NAME_RE.fullmatch(base):
        return None
    for ref in (f"origin/{base}", base):
        out = git_output(root, "log", "--format=%H%x09%ae%x09%s", "--no-merges", f"{ref}..HEAD")
        if out is not None:
            return [tuple(line.split("\t", 2)) for line in out.splitlines() if line]
    return None


Result = tuple[str, str, list[str]]


def _verdict(name: str, failures: list[str]) -> Result:
    return ("FAIL" if failures else "OK", name, failures)


def run_checks(root: Path, skip_git: bool) -> list[Result]:
    """검사 6개를 돌려 (상태, 이름, 상세) 목록을 돌려준다.

    템플릿 레포 자신(환경 변수 CHECK_REPO_TEMPLATE=1)은 필수 파일 외 다섯 검사를 모두
    건너뛴다. 프로젝트 이름으로 판단하지 않는 이유는 포크와 복제본이 이름을 물려받기 때문이다.
    """
    results: list[Result] = [_verdict("필수 파일", check_required_files(root))]

    in_ci = bool(os.environ.get("CI"))

    def skip_git_checks(reason: str) -> list[Result]:
        results.append(("SKIP", "브랜치 이름", [reason]))
        results.append(("SKIP", "커밋 메시지", [reason]))
        results.append(("SKIP", "커밋 이메일", [reason]))
        return results

    def git_broken(reason: str, names: tuple[str, ...]) -> None:
        """git이 깨진 상황. 로컬은 SKIP, CI(환경 변수 CI)에서는 관문이 무력화되므로 FAIL."""
        status = "FAIL" if in_ci else "SKIP"
        for name in names:
            results.append((status, name, [reason]))

    if is_template_repo():
        results.append(("SKIP", "설정 절", ["템플릿 레포"]))
        results.append(("SKIP", "템플릿 잔여물", ["템플릿 레포"]))
        return skip_git_checks("템플릿 레포")

    results.append(_verdict("설정 절", check_settings(root)))
    results.append(_verdict("템플릿 잔여물", check_template_leftovers(root)))

    settings = load_settings(root)
    key = settings.get(KEY_PROJECT_KEY, "")
    base = settings.get(KEY_BASE_BRANCH, "main")
    branch_types = parse_branch_types(settings.get(KEY_BRANCH_TYPES, ""))
    domains = parse_domains(settings.get(KEY_EMAIL_DOMAIN, ""))
    excluded = set(parse_list(settings.get(KEY_EXCLUDED, "")))

    def finish() -> list[Result]:
        """설정 절에서 제외한 검사는 결과와 무관하게 SKIP으로 바꾼다."""
        return [("SKIP", name, ["설정 제외"]) if name in excluded else (status, name, details)
                for status, name, details in results]

    if skip_git:
        skip_git_checks("--skip-git")
        return finish()
    branch = detect_branch(root)
    if branch is None:
        git_broken("분리된 HEAD" if git_output(root, "rev-parse", "--git-dir") is not None else "git 사용 불가",
                   ("브랜치 이름", "커밋 메시지", "커밋 이메일"))
        return finish()
    if branch == base:
        skip_git_checks(f"기준 브랜치 {base}")
        return finish()
    default_branch = os.environ.get("CI_DEFAULT_BRANCH", "")
    if default_branch and branch == default_branch:
        skip_git_checks(f"GitLab 기본 브랜치 {branch}")
        return finish()
    if not REF_NAME_RE.fullmatch(base):
        skip_git_checks(f"기준 브랜치 값 무효: {base}")
        return finish()

    results.append(_verdict("브랜치 이름", check_branch(branch, key, branch_types)))
    commits = list_commits(root, base)
    if commits is None:
        git_broken(f"기준 브랜치 참조 없음: {base}", ("커밋 메시지", "커밋 이메일"))
        return finish()
    results.append(_verdict("커밋 메시지", check_commits(commits, key)))
    if not domains:
        results.append(("SKIP", "커밋 이메일", ["설정 없음"]))
    else:
        results.append(_verdict("커밋 이메일", check_commit_emails(commits, domains)))
    return finish()


def report(results: list[Result], out=None) -> int:
    """결과를 출력하고 실패가 하나라도 있으면 1."""
    out = out or sys.stdout
    failed = 0
    for status, name, details in results:
        suffix = f" ({details[0]})" if status == "SKIP" and details else ""
        print(f"{status} {name}{suffix}", file=out)
        if status == "FAIL":
            failed += 1
            for detail in details:
                print(f"    {detail}", file=out)
    print(f"검사 {len(results)}개 중 실패 {failed}개", file=out)
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="레포 규칙 검사")
    parser.add_argument("--root", default=".", help="검사할 레포 루트 (기본: 현재 디렉터리)")
    parser.add_argument("--skip-git", action="store_true", help="브랜치·커밋 검사를 건너뛴다")
    args = parser.parse_args(argv)
    return report(run_checks(Path(args.root).resolve(), args.skip_git))


if __name__ == "__main__":
    sys.exit(main())
