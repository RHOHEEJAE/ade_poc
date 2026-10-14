# 레포 규칙 검사

`python3 scripts/check-repo.py`는 여섯 가지를 검사한다.  
값은 모두 AGENTS.md "프로젝트 설정" 절에서 읽는다.  
Python 3.14 기준, 표준 라이브러리만. CI의 `check` job이 MR과 브랜치 푸시마다 같은 명령을 돌린다.

| 검사 | 통과 조건 | 건너뛰는 경우 |
|---|---|---|
| 필수 파일 | AGENTS.md, CLAUDE.md, README.md, .gitignore, docs/specs/, docs/plans/ | 없음 |
| 설정 절 | 절이 있고, 꺾쇠가 없고, Plane 프로젝트 키가 대문자 영문으로 시작하는 영문·숫자, 기준 브랜치가 브랜치 이름 형식, 이메일 도메인이 도메인만(앞의 `@` 하나는 허용), 항목 중복이 없고, `검사 제외` 이름이 유효 | 템플릿 레포(`CHECK_REPO_TEMPLATE=1`) |
| 템플릿 잔여물 | `_template-only/`가 없고 README.md의 `<!-- template-readme:` 주석이 지워짐 | 템플릿 레포 |
| 브랜치 이름 | `<브랜치 타입>/<키>-<번호>` | 기준 브랜치, GitLab 기본 브랜치, 템플릿 레포 |
| 커밋 메시지 | 기준 브랜치 이후 모든 커밋(머지 커밋 제외)이 `<키>-<번호>: `로 시작 | 브랜치 이름과 같음 |
| 커밋 이메일 | 같은 커밋들의 작성자 이메일이 설정 절의 도메인(쉼표로 여러 개 가능) 중 하나로 끝남 | 위와 같음, 설정 절에 도메인이 없을 때 |

`CHECK_REPO_TEMPLATE=1`은 code-template 레포 자신에게만 두는 변수다.  
그 레포의 프로젝트 CI/CD 변수와 유지보수자의 로컬 셸에만 있고, 그룹 변수나 다른 레포에 두면 검사가 꺼진다.  
등록 절차는 템플릿 레포의 `_template-only/README.md`에 있다.

특정 검사를 끄려면 설정 절에 `검사 제외: 브랜치 이름, 커밋 메시지`처럼 적는다.  
필수 파일과 설정 절 검사는 끌 수 없다.

`--skip-git`을 주면 파일 검사만 한다. `--root <경로>`로 다른 레포를 검사할 수 있다.  
출력은 검사마다 `OK`, `SKIP (사유)`, `FAIL` 한 줄이고 실패가 있으면 종료 코드 1이다.  
git이 없거나 분리된 HEAD이거나 기준 브랜치 참조가 없으면 로컬에서는 SKIP이고, CI(환경 변수 `CI`)에서는 관문이 무력화되지 않도록 FAIL이다.  
git의 오류 메시지는 stderr로 그대로 나온다.  
커밋 범위는 `origin/<기준 브랜치>..HEAD`이므로 기준 브랜치는 푸시된 상태여야 하고, MR 대상은 기준 브랜치여야 한다.  
다른 브랜치로 향한 MR은 기준 브랜치 이후 커밋을 전부 검사한다.

테스트는 `python3 -m unittest discover -s scripts -p 'test_check_repo.py'`.  
검사를 추가하려면 순수 함수 하나, `run_checks`의 `_verdict` 한 줄과 SKIP 목록(`skip_git_checks`, 템플릿 면제, `git_broken`), `EXCLUDABLE_CHECKS` 항목, 검사 개수를 적은 문장(이 문서와 `run_checks` 독스트링), AGENTS.md 설정 절 안내의 검사 제외 목록, 이 표의 한 행이다. 테스트 파일을 늘릴 때는 `test_check_repo_<주제>.py`로 이름 짓고 CI 패턴을 넓힌다.
