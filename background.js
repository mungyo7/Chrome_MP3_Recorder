// 아이콘 클릭으로 녹음 시작/중지를 토글한다. 외부 네트워크 요청 없음.
const OFFSCREEN_URL = 'offscreen.html';

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  return contexts.length > 0;
}

function makeName(title) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const safe = (title || 'tab').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 60) || 'tab';
  return `${safe}_${stamp}`;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (await hasOffscreen()) {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
    return;
  }
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (err) {
    // chrome:// 페이지나 웹스토어처럼 캡처가 막힌 탭
    console.error(err);
    chrome.action.setBadgeText({ text: 'ERR' });
    return;
  }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: '탭 오디오 녹음'
  });
  // 서비스 워커는 녹음 중 잠들 수 있으므로 파일 이름은 offscreen 쪽에 맡긴다.
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, name: makeName(tab.title) });
  chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  chrome.action.setBadgeText({ text: 'REC' });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'background') return;
  if (msg.type === 'error') {
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.offscreen.closeDocument().catch(() => {});
    return;
  }
  if (msg.type === 'saved') {
    chrome.action.setBadgeText({ text: '' });
    chrome.downloads.download({
      url: msg.url,
      filename: `${msg.name}.${msg.ext}`,
      saveAs: false
    }, (downloadId) => {
      if (downloadId === undefined) {
        chrome.offscreen.closeDocument().catch(() => {});
        return;
      }
      // 다운로드가 끝나면 offscreen 문서를 닫아 blob 메모리를 해제한다.
      const onChanged = (delta) => {
        if (delta.id !== downloadId || !delta.state) return;
        if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
          chrome.downloads.onChanged.removeListener(onChanged);
          chrome.offscreen.closeDocument().catch(() => {});
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
    });
  }
});
