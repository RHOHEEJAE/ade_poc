export type ExtensionContext = {
    /** 이벤트 하나를 벤더로 보낸다. 벤더가 아직 없으면 버리고 진단만 남긴다. */
    track: (event: string, props: Record<string, unknown>, opts?: {
        sendImmediately?: boolean;
    }) => void;
    /** 진단 사유 하나. 값은 싣지 않는다. */
    report: (reason: string) => void;
    /** 자기 수집 서버 주소. 관찰에서 자기 요청을 빼는 데 쓴다(system) — 안 빼면 순환한다. */
    apiHost: string;
};
