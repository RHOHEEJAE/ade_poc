/** 규칙 코드의 버전. 읽기 규칙과 검사 규칙이 바뀌면 올린다. */
export declare const RULE_VERSION = "0.1.0";
/**
 * 규칙 코드가 이해하는 어휘 파일의 형식 버전(DA-93).
 *
 * 데이터실이 바꾸는 어휘 `version` 과 다르다. 어휘 파일의 형식이 바뀔 때만 올린다.
 * 에디터 확장과 검증 CLI 와 어휘 YAML 이 같은 값을 써야 한다.
 * 값이 어긋나면 `ADE-206` 형식 버전 불일치로 막는다.
 */
export declare const VOCAB_SCHEMA_VERSION = 1;
/**
 * 검증 CLI 의 배포 이름. 저장소의 디렉터리 이름 `packages/cli` 와 다르다.
 *
 * 이 이름은 CI 설정에 `npx @adestack/validate@1` 로 적힌다.
 * 그 줄에서 무엇을 하는 도구인지 드러나도록 배포 이름을 따로 두었다(05 ADR-016 각주).
 */
export declare const PACKAGE_NAME = "@adestack/validate";
export type VersionHeaderInput = {
    ruleVersion: string;
    vocabularyVersion: string | number;
    /** `ADE_APP_ID`. 값이 비면 그 칸만 빠진다. 빈 값은 `ADE-211` 앱 식별자 없음이 따로 막는다. */
    appId?: string;
    /** 어휘 파일의 형식 버전. 데이터 `version` 과 다르며 `ADE-206` 형식 버전 불일치가 보는 값이다. */
    schemaVersion?: string | number;
    /**
     * 주제별 어휘 버전. 이 목록을 주어야 폴백 표시를 붙일 수 있다.
     * 문자열을 다시 나누면 주제 이름에 공백이 있을 때 어긋나므로 목록을 따로 받는다.
     */
    vocabularyVersions?: readonly {
        service: string;
        version: string | number;
    }[];
    /**
     * 어휘 서버에 연결하지 못해 폴백 사본으로 읽은 주제. 그 주제의 버전 뒤에 `(폴백)` 을 붙인다.
     * 캐시에서 읽은 주제는 여기에 넣지 않는다. 캐시는 어휘 서버가 준 사본이다.
     */
    fallbackServices?: readonly string[];
    /** 검사한 파일 수. 0 이면 검사 대상이 없었다는 뜻이므로 칸을 빼지 않는다. */
    fileCount?: number;
};
/**
 * 검사 출력의 첫 줄로 쓰는 버전 머리글을 만든다. 줄바꿈 없는 한 줄이다.
 *
 * ```
 * @adestack/validate v0.1.0   (app: store-web · 어휘 common 5, store 3 · schema v1 · 파일 248)
 * ```
 *
 * 값이 없는 칸은 칸째로 뺀다. 빈 값을 남기면 읽는 사람이 그것을 오류로 읽는다.
 * 폴백 사본으로 읽은 주제는 버전 뒤에 `(폴백)` 을 붙인다.
 * 검사한 파일 수는 0 이어도 낸다. 검사 대상이 없는 것과 검사해서 통과한 것을 구분해야 한다.
 * 칸의 구성은 docs/설계/계약-판정과-버전.md 에 있다.
 */
export declare function formatVersionHeader(input: VersionHeaderInput): string;
