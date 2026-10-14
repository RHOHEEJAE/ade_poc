"""scripts/check-repo.py 테스트.

실행: python3 -m unittest discover -s scripts -p 'test_check_repo.py'
CI도 이 파일 이름으로만 수집한다(복사 대상 레포의 scripts/test_*.py 를 끌어오지 않기 위해).
테스트 파일을 늘릴 때는 test_check_repo_<주제>.py 로 이름 짓고 CI 패턴을 test_check_repo*.py 로 넓힌다.
check-repo.py는 파일 이름에 하이픈이 있어 일반 import가 안 되므로 경로로 로드한다.
"""
from __future__ import annotations

import importlib.util
import io
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# 검사기가 부르는 git 도 개발자의 전역·시스템 git 설정을 읽지 않게 한다(테스트 프로세스 한정).
os.environ["GIT_CONFIG_GLOBAL"] = os.devnull
os.environ["GIT_CONFIG_SYSTEM"] = os.devnull

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("check_repo", HERE / "check-repo.py")
check_repo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_repo)
check_repo.SHOW_GIT_ERRORS = False  # 의도된 git 실패의 stderr 소음을 막는다

SETTINGS_OK = """# 작업 규칙

## 프로젝트 설정
복제 후 이 절만 채운다.

- Plane 프로젝트: 샘플
- Plane 프로젝트 키: DA
- 결정 문서 레포: /path/to/docs
- 근거 문서: decisions.md
- 기준 브랜치: main
- 브랜치 타입: feature, bug, chore, docs
- 커밋 이메일 도메인: example.com

## 작업 단위와 근거

- 본문 규칙
"""


def make_root(tmp: Path, agents: str = SETTINGS_OK) -> Path:
    """필수 파일이 전부 있는 최소 레포 루트를 만든다."""
    for rel in ("CLAUDE.md", "README.md", ".editorconfig", ".gitignore"):
        (tmp / rel).write_text("x\n", encoding="utf-8")
    (tmp / "AGENTS.md").write_text(agents, encoding="utf-8")
    (tmp / "docs/specs").mkdir(parents=True)
    (tmp / "docs/plans").mkdir(parents=True)
    return tmp


GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_SYSTEM": os.devnull,
}
CI_VARS = ("CHECK_REPO_TEMPLATE", "CI", "CI_MERGE_REQUEST_SOURCE_BRANCH_NAME", "CI_COMMIT_BRANCH", "CI_DEFAULT_BRANCH")


def git(root: Path, *args: str) -> str:
    """테스트용 git. 전역 설정에 의존하지 않는다."""
    return subprocess.run(
        ["git", *args], cwd=root, env=GIT_ENV, check=True, capture_output=True, text=True
    ).stdout.strip()


def init_repo(root: Path) -> None:
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "init")


def commit_file(root: Path, name: str, message: str) -> None:
    (root / name).write_text(name + "\n", encoding="utf-8")
    git(root, "add", name)
    git(root, "commit", "-q", "-m", message)


def no_ci_env():
    """CI 변수를 비워서 로컬 경로(git 명령)를 타게 한다."""
    return mock.patch.dict(os.environ, {var: "" for var in CI_VARS})


class RequiredFilesTest(unittest.TestCase):
    def test_all_present_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            self.assertEqual(check_repo.check_required_files(root), [])

    def test_missing_editorconfig_is_not_required(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / ".editorconfig").unlink()
            self.assertEqual(check_repo.check_required_files(root), [])

    def test_missing_plans_dir_is_reported(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / "docs/plans").rmdir()
            failures = check_repo.check_required_files(root)
            self.assertEqual(len(failures), 1)
            self.assertIn("docs/plans", failures[0])


class SettingsTest(unittest.TestCase):
    def test_valid_settings_pass(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            self.assertEqual(check_repo.check_settings(root), [])

    def test_placeholder_fails(self):
        agents = SETTINGS_OK.replace("/path/to/docs", "〈문서 경로〉")
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d), agents=agents)
            failures = check_repo.check_settings(root)
            self.assertEqual(len(failures), 1)
            self.assertIn("〈문서 경로〉", failures[0])

    def test_missing_section_fails(self):
        agents = "# 작업 규칙\n\n## 작업 단위와 근거\n\n- 본문 규칙\n"
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d), agents=agents)
            failures = check_repo.check_settings(root)
            self.assertEqual(len(failures), 1)
            self.assertIn("프로젝트 설정", failures[0])

    def test_missing_agents_file_fails(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / "AGENTS.md").unlink()
            failures = check_repo.check_settings(root)
            self.assertEqual(failures, ["AGENTS.md 없음"])

    def test_lowercase_key_fails(self):
        agents = SETTINGS_OK.replace("Plane 프로젝트 키: DA", "Plane 프로젝트 키: da")
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d), agents=agents)
            failures = check_repo.check_settings(root)
            self.assertEqual(len(failures), 1)
            self.assertIn("프로젝트 키", failures[0])

    def test_key_with_digits_passes(self):
        agents = SETTINGS_OK.replace("Plane 프로젝트 키: DA", "Plane 프로젝트 키: WEB2")
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(check_repo.check_settings(make_root(Path(d), agents=agents)), [])

    def test_key_starting_with_digit_fails(self):
        agents = SETTINGS_OK.replace("Plane 프로젝트 키: DA", "Plane 프로젝트 키: 2WEB")
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(len(check_repo.check_settings(make_root(Path(d), agents=agents))), 1)

    def test_unknown_excluded_check_name_fails(self):
        agents = SETTINGS_OK.replace("- 기준 브랜치: main\n", "- 기준 브랜치: main\n- 검사 제외: 브랜치 이름, 없는검사\n")
        with tempfile.TemporaryDirectory() as d:
            failures = check_repo.check_settings(make_root(Path(d), agents=agents))
            self.assertEqual(len(failures), 1)
            self.assertIn("없는검사", failures[0])

    def test_base_branch_starting_with_dash_fails(self):
        agents = SETTINGS_OK.replace("기준 브랜치: main", "기준 브랜치: --output=./pwned")
        with tempfile.TemporaryDirectory() as d:
            failures = check_repo.check_settings(make_root(Path(d), agents=agents))
            self.assertEqual(len(failures), 1)
            self.assertIn("기준 브랜치", failures[0])

    def test_base_branch_with_slash_and_dot_passes(self):
        agents = SETTINGS_OK.replace("기준 브랜치: main", "기준 브랜치: release/v1.2")
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(check_repo.check_settings(make_root(Path(d), agents=agents)), [])

    def test_settings_check_cannot_be_excluded(self):
        self.assertNotIn("설정 절", check_repo.EXCLUDABLE_CHECKS)
        agents = SETTINGS_OK.replace("- 기준 브랜치: main\n", "- 기준 브랜치: main\n- 검사 제외: 설정 절\n")
        with tempfile.TemporaryDirectory() as d:
            failures = check_repo.check_settings(make_root(Path(d), agents=agents))
            self.assertEqual(len(failures), 1)
            self.assertIn("설정 절", failures[0])

    def test_email_domain_with_at_sign_is_normalized_or_rejected(self):
        agents = SETTINGS_OK.replace("커밋 이메일 도메인: example.com", "커밋 이메일 도메인: @example.com")
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d), agents=agents)
            self.assertEqual(check_repo.check_settings(root), [])
            self.assertEqual(check_repo.parse_domains(check_repo.load_settings(root)["커밋 이메일 도메인"]), ("example.com",))
        agents = SETTINGS_OK.replace("커밋 이메일 도메인: example.com", "커밋 이메일 도메인: me@example.com")
        with tempfile.TemporaryDirectory() as d:
            failures = check_repo.check_settings(make_root(Path(d), agents=agents))
            self.assertEqual(len(failures), 1)
            self.assertIn("커밋 이메일 도메인", failures[0])

    def test_duplicate_key_fails(self):
        agents = SETTINGS_OK.replace("- 기준 브랜치: main\n", "- 기준 브랜치: main\n- 기준 브랜치: develop\n")
        with tempfile.TemporaryDirectory() as d:
            failures = check_repo.check_settings(make_root(Path(d), agents=agents))
            self.assertEqual(len(failures), 1)
            self.assertIn("기준 브랜치", failures[0])
            self.assertIn("중복", failures[0])

    def test_heading_inside_code_fence_is_ignored(self):
        fenced = "# 작업 규칙\n\n```markdown\n## 프로젝트 설정\n- Plane 프로젝트 키: FAKE\n```\n\n" + SETTINGS_OK.split("\n", 2)[2]
        section = check_repo.settings_section(fenced)
        self.assertIn("Plane 프로젝트 키: DA", section)
        self.assertNotIn("FAKE", section)

    def test_utf8_bom_is_tolerated(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / "AGENTS.md").write_bytes(b"\xef\xbb\xbf" + SETTINGS_OK.split("\n", 2)[2].encode("utf-8"))
            self.assertEqual(check_repo.load_settings(root)["Plane 프로젝트 키"], "DA")

    def test_placeholders_do_not_add_format_errors(self):
        agents = SETTINGS_OK.replace("Plane 프로젝트 키: DA", "Plane 프로젝트 키: 〈프로젝트 키〉").replace("커밋 이메일 도메인: example.com", "커밋 이메일 도메인: 〈회사 이메일 도메인〉")
        with tempfile.TemporaryDirectory() as d:
            failures = check_repo.check_settings(make_root(Path(d), agents=agents))
            self.assertEqual(len(failures), 2)
            self.assertTrue(all(f.startswith("플레이스홀더") for f in failures), failures)

    def test_parse_list_splits_and_strips(self):
        self.assertEqual(check_repo.parse_list(" a.com ,b.com,,"), ("a.com", "b.com"))
        self.assertEqual(check_repo.parse_list(""), ())

    def test_template_repo_is_detected_by_env_var(self):
        with mock.patch.dict(os.environ, {"CHECK_REPO_TEMPLATE": "1"}):
            self.assertTrue(check_repo.is_template_repo())
        for value in ("", "0", "false", "no"):
            with self.subTest(value=value), mock.patch.dict(os.environ, {"CHECK_REPO_TEMPLATE": value}):
                self.assertFalse(check_repo.is_template_repo())

    def test_load_settings_reads_key_and_base_branch(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            settings = check_repo.load_settings(root)
            self.assertEqual(settings["Plane 프로젝트 키"], "DA")
            self.assertEqual(settings["기준 브랜치"], "main")

    def test_load_settings_without_section_is_empty(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d), agents="# 작업 규칙\n")
            self.assertEqual(check_repo.load_settings(root), {})

    def test_section_ends_at_next_heading(self):
        section = check_repo.settings_section(SETTINGS_OK)
        self.assertIn("Plane 프로젝트 키: DA", section)
        self.assertNotIn("본문 규칙", section)


class BranchNameTest(unittest.TestCase):
    TYPES = ("feature", "bug", "chore", "docs")

    def test_valid_branches_pass(self):
        for branch in ("feature/DA-117", "bug/DA-130", "chore/DA-1", "docs/DA-42"):
            with self.subTest(branch=branch):
                self.assertEqual(check_repo.check_branch(branch, "DA", self.TYPES), [])

    def test_custom_types_from_settings(self):
        self.assertEqual(check_repo.check_branch("hotfix/DA-1", "DA", ("hotfix",)), [])
        self.assertEqual(len(check_repo.check_branch("feature/DA-1", "DA", ("hotfix",))), 1)

    def test_parse_branch_types_splits_and_strips(self):
        self.assertEqual(check_repo.parse_branch_types("feature, bug ,chore"), ("feature", "bug", "chore"))
        self.assertEqual(check_repo.parse_branch_types(""), check_repo.DEFAULT_BRANCH_TYPES)

    def test_invalid_branches_fail_and_name_the_branch(self):
        for branch in ("feature/DA-117-title", "DA-117", "hotfix/DA-1", "feature/da-117", "feature/DA-", "main"):
            with self.subTest(branch=branch):
                failures = check_repo.check_branch(branch, "DA", self.TYPES)
                self.assertEqual(len(failures), 1)
                self.assertIn(branch, failures[0])

    def test_missing_key_fails(self):
        failures = check_repo.check_branch("feature/DA-1", "", self.TYPES)
        self.assertEqual(len(failures), 1)
        self.assertIn("프로젝트 키", failures[0])


class CommitMessageTest(unittest.TestCase):
    def test_prefixed_commits_pass(self):
        commits = [("a" * 40, "t@example.com", "DA-117: 기능 추가"), ("b" * 40, "t@example.com", "DA-117: 테스트 추가")]
        self.assertEqual(check_repo.check_commits(commits, "DA"), [])

    def test_unprefixed_commit_reports_short_hash_and_subject(self):
        commits = [("a" * 40, "t@example.com", "DA-117: 기능 추가"), ("b" * 40, "t@example.com", "기능 추가")]
        failures = check_repo.check_commits(commits, "DA")
        self.assertEqual(len(failures), 1)
        self.assertIn("bbbbbbb", failures[0])
        self.assertIn("기능 추가", failures[0])

    def test_wrong_key_or_missing_space_fails(self):
        for subject in ("DU-1: 다른 프로젝트", "DA-1:공백 없음", "da-1: 소문자", "DA-: 번호 없음"):
            with self.subTest(subject=subject):
                failures = check_repo.check_commits([("c" * 40, "t@example.com", subject)], "DA")
                self.assertEqual(len(failures), 1)

    def test_empty_commit_list_passes(self):
        self.assertEqual(check_repo.check_commits([], "DA"), [])

    def test_missing_key_fails(self):
        failures = check_repo.check_commits([("a" * 40, "t@example.com", "DA-1: x")], "")
        self.assertEqual(len(failures), 1)
        self.assertIn("프로젝트 키", failures[0])


class CommitEmailTest(unittest.TestCase):
    def test_matching_domain_passes(self):
        commits = [("a" * 40, "a@company.com", "DA-1: x"), ("b" * 40, "B@Company.com", "DA-1: y")]
        self.assertEqual(check_repo.check_commit_emails(commits, ("company.com",)), [])

    def test_other_domain_reports_hash_and_email(self):
        commits = [("a" * 40, "a@company.com", "DA-1: x"), ("b" * 40, "me@gmail.com", "DA-1: y")]
        failures = check_repo.check_commit_emails(commits, ("company.com",))
        self.assertEqual(len(failures), 1)
        self.assertIn("bbbbbbb", failures[0])
        self.assertIn("me@gmail.com", failures[0])

    def test_subdomain_trick_fails(self):
        commits = [("c" * 40, "x@company.com.evil.com", "DA-1: z"), ("d" * 40, "x@notcompany.com", "DA-1: w")]
        self.assertEqual(len(check_repo.check_commit_emails(commits, ("company.com",))), 2)


    def test_any_of_multiple_domains_passes(self):
        commits = [("a" * 40, "a@a.com", "DA-1: x"), ("b" * 40, "b@b.com", "DA-1: y"), ("c" * 40, "c@c.com", "DA-1: z")]
        failures = check_repo.check_commit_emails(commits, ("a.com", "b.com"))
        self.assertEqual(len(failures), 1)
        self.assertIn("c@c.com", failures[0])
        self.assertIn("@a.com", failures[0])
        self.assertIn("@b.com", failures[0])


class TemplateLeftoverTest(unittest.TestCase):
    def test_clean_repo_passes(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / "docs/specs/2026-09-09-DA-1.md").write_text("x\n", encoding="utf-8")
            self.assertEqual(check_repo.check_template_leftovers(root), [])

    def test_template_dir_is_reported(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / "_template-only").mkdir()
            (root / "_template-only/README.md").write_text("x\n", encoding="utf-8")
            failures = check_repo.check_template_leftovers(root)
            self.assertEqual(len(failures), 1)
            self.assertIn("_template-only/", failures[0])

    def test_readme_marker_is_reported(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / "README.md").write_text(check_repo.README_TEMPLATE_MARKER + "\n# 제목\n", encoding="utf-8")
            failures = check_repo.check_template_leftovers(root)
            self.assertEqual(len(failures), 1)
            self.assertIn("README.md", failures[0])

    def test_project_own_docs_are_not_leftovers(self):
        with tempfile.TemporaryDirectory() as d:
            root = make_root(Path(d))
            (root / "docs/guides").mkdir()
            (root / "docs/guides/my-own-guide.md").write_text("x\n", encoding="utf-8")
            (root / "docs/specs/2026-09-08-code-template-design.md").write_text("x\n", encoding="utf-8")
            self.assertEqual(check_repo.check_template_leftovers(root), [])


class GitIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = make_root(Path(self.tmp.name))
        init_repo(self.root)
        self.env = no_ci_env()
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_detect_branch_reads_current_branch(self):
        git(self.root, "checkout", "-q", "-b", "feature/DA-117")
        self.assertEqual(check_repo.detect_branch(self.root), "feature/DA-117")

    def test_detect_branch_prefers_ci_variable(self):
        with mock.patch.dict(os.environ, {"CI_MERGE_REQUEST_SOURCE_BRANCH_NAME": "bug/DA-9"}):
            self.assertEqual(check_repo.detect_branch(self.root), "bug/DA-9")

    def test_detect_branch_outside_git_is_none(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(check_repo.detect_branch(Path(d)))

    def test_list_commits_returns_commits_after_base_newest_first(self):
        git(self.root, "checkout", "-q", "-b", "feature/DA-117")
        commit_file(self.root, "a.txt", "DA-117: 첫 커밋")
        commit_file(self.root, "b.txt", "둘째")
        commits = check_repo.list_commits(self.root, "main")
        self.assertEqual([subject for _, _, subject in commits], ["둘째", "DA-117: 첫 커밋"])
        self.assertTrue(all(len(sha) == 40 and "@" in email for sha, email, _ in commits))

    def test_list_commits_rejects_option_like_base(self):
        self.assertIsNone(check_repo.list_commits(self.root, "--output=./pwned"))
        self.assertFalse(list(self.root.glob("pwned*")))

    def test_list_commits_without_base_ref_is_none(self):
        self.assertIsNone(check_repo.list_commits(self.root, "no-such-branch"))

    def test_list_commits_excludes_merge_commits(self):
        git(self.root, "checkout", "-q", "-b", "feature/DA-117")
        commit_file(self.root, "a.txt", "DA-117: 첫 커밋")
        git(self.root, "checkout", "-q", "main")
        commit_file(self.root, "m.txt", "main 쪽 커밋")
        git(self.root, "checkout", "-q", "feature/DA-117")
        git(self.root, "merge", "--no-ff", "-m", "Merge branch 'main' into feature/DA-117", "main")
        self.assertEqual(
            [c[2] for c in check_repo.list_commits(self.root, "main")], ["DA-117: 첫 커밋"]
        )

    def test_list_commits_uses_origin_base_when_present(self):
        clone_dir = str(Path(self.tmp.name) / "clone")
        git(self.root, "clone", "-q", str(self.root), clone_dir)
        clone = Path(clone_dir)
        commit_file(clone, "x.txt", "DA-9: main 로컬 커밋")
        git(clone, "checkout", "-q", "-b", "feature/DA-1")
        commit_file(clone, "y.txt", "DA-1: 기능")
        self.assertEqual(
            [c[2] for c in check_repo.list_commits(clone, "main")],
            ["DA-1: 기능", "DA-9: main 로컬 커밋"],
        )


class RunChecksTest(unittest.TestCase):
    def statuses(self, results):
        return {name: status for status, name, _ in results}

    def test_all_pass_on_feature_branch(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d))
            init_repo(root)
            git(root, "remote", "add", "origin", "https://gitlab.example.com/group/web-sdk.git")
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results), {"필수 파일": "OK", "설정 절": "OK", "템플릿 잔여물": "OK", "브랜치 이름": "OK", "커밋 메시지": "OK", "커밋 이메일": "OK"})
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 0)
            self.assertIn("검사 6개 중 실패 0개", out.getvalue())

    def test_base_branch_skips_git_checks(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d))
            init_repo(root)
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["브랜치 이름"], "SKIP")
            self.assertEqual(self.statuses(results)["커밋 메시지"], "SKIP")
            out = io.StringIO()
            check_repo.report(results, out)
            self.assertIn("SKIP 브랜치 이름 (기준 브랜치 main)", out.getvalue())

    def test_template_repo_skips_settings_check(self):
        agents = SETTINGS_OK.replace("/path/to/docs", "〈문서 경로〉")
        with tempfile.TemporaryDirectory() as d, no_ci_env(), mock.patch.dict(os.environ, {"CHECK_REPO_TEMPLATE": "1"}):
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "remote", "add", "origin", "https://gitlab.example.com/group/code-template.git")
            git(root, "checkout", "-q", "-b", "feature/wrong-name")
            commit_file(root, "a.txt", "접두 없음")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(
                self.statuses(results),
                {"필수 파일": "OK", "설정 절": "SKIP", "템플릿 잔여물": "SKIP", "브랜치 이름": "SKIP", "커밋 메시지": "SKIP", "커밋 이메일": "SKIP"},
            )
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 0)
            self.assertIn("SKIP 설정 절 (템플릿 레포)", out.getvalue())
            self.assertIn("SKIP 브랜치 이름 (템플릿 레포)", out.getvalue())

    def test_fork_named_code_template_without_env_var_is_checked(self):
        agents = SETTINGS_OK.replace("/path/to/docs", "〈문서 경로〉")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "remote", "add", "origin", "https://gitlab.example.com/fork/code-template.git")
            results = check_repo.run_checks(root, skip_git=True)
            self.assertEqual(self.statuses(results)["설정 절"], "FAIL")

    def test_branch_type_from_settings_is_used(self):
        agents = SETTINGS_OK.replace("브랜치 타입: feature, bug, chore, docs", "브랜치 타입: hotfix")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "hotfix/DA-1")
            commit_file(root, "a.txt", "DA-1: 긴급")
            self.assertEqual(self.statuses(check_repo.run_checks(root, skip_git=False))["브랜치 이름"], "OK")

    def test_failures_on_feature_branch_are_reported(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d))
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1-title")
            commit_file(root, "a.txt", "접두 없음")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["브랜치 이름"], "FAIL")
            self.assertEqual(self.statuses(results)["커밋 메시지"], "FAIL")
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 1)
            self.assertIn("feature/DA-1-title", out.getvalue())
            self.assertIn("접두 없음", out.getvalue())

    def test_multiple_file_failures_are_all_reported_with_exit_1(self):
        agents = SETTINGS_OK.replace("/path/to/docs", "〈경로〉")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            (root / "docs/plans").rmdir()
            results = check_repo.run_checks(root, skip_git=True)
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 1)
            text = out.getvalue()
            self.assertIn("    없음: docs/plans", text)
            self.assertIn("〈경로〉", text)
            self.assertIn("SKIP 브랜치 이름 (--skip-git)", text)
            self.assertIn("검사 6개 중 실패 2개", text)

    def test_wrong_email_domain_fails(self):
        agents = SETTINGS_OK.replace("커밋 이메일 도메인: example.com", "커밋 이메일 도메인: company.com")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["커밋 이메일"], "FAIL")
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 1)
            self.assertIn("test@example.com", out.getvalue())

    def test_missing_email_domain_setting_skips(self):
        agents = SETTINGS_OK.replace("- 커밋 이메일 도메인: example.com\n", "")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["커밋 이메일"], "SKIP")
            out = io.StringIO()
            check_repo.report(results, out)
            self.assertIn("SKIP 커밋 이메일 (설정 없음)", out.getvalue())

    def test_excluded_checks_are_skipped(self):
        agents = SETTINGS_OK.replace("- 기준 브랜치: main\n", "- 기준 브랜치: main\n- 검사 제외: 브랜치 이름, 커밋 메시지\n")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1-title")
            commit_file(root, "a.txt", "접두 없음")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["브랜치 이름"], "SKIP")
            self.assertEqual(self.statuses(results)["커밋 메시지"], "SKIP")
            self.assertEqual(self.statuses(results)["커밋 이메일"], "OK")
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 0)
            self.assertIn("SKIP 브랜치 이름 (설정 제외)", out.getvalue())

    def test_template_leftover_docs_fail_in_clone(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d))
            (root / "_template-only").mkdir()
            results = check_repo.run_checks(root, skip_git=True)
            self.assertEqual(self.statuses(results)["템플릿 잔여물"], "FAIL")
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 1)
            self.assertIn("_template-only/", out.getvalue())

    def test_detached_head_reason(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d))
            init_repo(root)
            git(root, "checkout", "-q", "--detach")
            out = io.StringIO()
            check_repo.report(check_repo.run_checks(root, skip_git=False), out)
            self.assertIn("SKIP 브랜치 이름 (분리된 HEAD)", out.getvalue())

    def test_missing_base_branch_reason(self):
        agents = SETTINGS_OK.replace("기준 브랜치: main", "기준 브랜치: develop")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            out = io.StringIO()
            check_repo.report(check_repo.run_checks(root, skip_git=False), out)
            self.assertIn("SKIP 커밋 메시지 (기준 브랜치 참조 없음: develop)", out.getvalue())

    def test_invalid_base_branch_skips_git_checks_and_writes_nothing(self):
        agents = SETTINGS_OK.replace("기준 브랜치: main", "기준 브랜치: --output=./pwned")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["설정 절"], "FAIL")
            self.assertEqual(self.statuses(results)["커밋 메시지"], "SKIP")
            self.assertFalse(list(root.glob("pwned*")))

    def test_two_email_domains_in_settings(self):
        agents = SETTINGS_OK.replace("커밋 이메일 도메인: example.com", "커밋 이메일 도메인: other.com, example.com")
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            self.assertEqual(self.statuses(check_repo.run_checks(root, skip_git=False))["커밋 이메일"], "OK")

    def test_default_branch_push_is_skipped_when_base_differs(self):
        agents = SETTINGS_OK.replace("기준 브랜치: main", "기준 브랜치: develop")
        with tempfile.TemporaryDirectory() as d, no_ci_env(), mock.patch.dict(os.environ, {"CI": "true", "CI_COMMIT_BRANCH": "main", "CI_DEFAULT_BRANCH": "main"}):
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            out = io.StringIO()
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(check_repo.report(results, out), 0)
            self.assertIn("SKIP 브랜치 이름 (GitLab 기본 브랜치 main)", out.getvalue())

    def test_ci_git_unavailable_is_fail(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env(), mock.patch.dict(os.environ, {"CI": "true"}):
            root = make_root(Path(d))
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["브랜치 이름"], "FAIL")
            self.assertEqual(self.statuses(results)["커밋 메시지"], "FAIL")
            out = io.StringIO()
            self.assertEqual(check_repo.report(results, out), 1)
            self.assertIn("git 사용 불가", out.getvalue())

    def test_ci_missing_base_ref_is_fail(self):
        agents = SETTINGS_OK.replace("기준 브랜치: main", "기준 브랜치: develop")
        with tempfile.TemporaryDirectory() as d, no_ci_env(), mock.patch.dict(os.environ, {"CI": "true", "CI_COMMIT_BRANCH": "feature/DA-1", "CI_DEFAULT_BRANCH": "main"}):
            root = make_root(Path(d), agents=agents)
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["커밋 메시지"], "FAIL")
            out = io.StringIO()
            check_repo.report(results, out)
            self.assertIn("기준 브랜치 참조 없음: develop", out.getvalue())

    def test_mr_pipeline_detached_head_uses_source_branch_var(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d))
            init_repo(root)
            git(root, "checkout", "-q", "-b", "feature/DA-1")
            commit_file(root, "a.txt", "DA-1: 시작")
            git(root, "checkout", "-q", "--detach")
            with mock.patch.dict(os.environ, {"CI": "true", "CI_MERGE_REQUEST_SOURCE_BRANCH_NAME": "feature/DA-1", "CI_DEFAULT_BRANCH": "main"}):
                results = check_repo.run_checks(root, skip_git=False)
            self.assertEqual(self.statuses(results)["브랜치 이름"], "OK")
            self.assertEqual(self.statuses(results)["커밋 메시지"], "OK")
            self.assertEqual(self.statuses(results)["커밋 이메일"], "OK")

    def test_main_returns_exit_code(self):
        with tempfile.TemporaryDirectory() as d, no_ci_env():
            root = make_root(Path(d))
            with mock.patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(check_repo.main(["--root", str(root), "--skip-git"]), 0)
            (root / "CLAUDE.md").unlink()
            with mock.patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(check_repo.main(["--root", str(root), "--skip-git"]), 1)


if __name__ == "__main__":
    unittest.main()
