/**
 * Stock Dashboard Registry (암호로 URL/토큰 불러오기용)
 *
 * 목적:
 * - 사용자의 Apps Script URL/토큰을 "암호로 암호화된 형태"로만 저장
 * - 서버(이 스크립트)는 암호/원문을 절대 모름
 *
 * 배포:
 * - 배포 → 새 배포 → 유형: 웹 앱
 * - 실행: 나 / 접근: 모든 사용자
 * - 생성된 /exec URL을 앱(app.js)의 REGISTRY_URL에 넣기
 */

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  const action = body.action;

  const props = PropertiesService.getScriptProperties();

  if (action === "register") {
    // body: { id: string, payload: {v,salt,iv,ct} }
    if (!body.id || !body.payload) return json_({ ok: false, error: "MISSING_ID_OR_PAYLOAD" });
    props.setProperty("u_" + body.id, JSON.stringify(body.payload));
    return json_({ ok: true });
  }

  if (action === "get") {
    // body: { id: string }
    if (!body.id) return json_({ ok: false, error: "MISSING_ID" });
    const v = props.getProperty("u_" + body.id);
    if (!v) return json_({ ok: false, error: "NOT_FOUND" });
    return json_({ ok: true, payload: JSON.parse(v) });
  }

  return json_({ ok: false, error: "BAD_ACTION" });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
