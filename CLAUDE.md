# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # 개발 서버 (localhost:3000)
npm run build    # 정적 빌드 → ./out/ 생성 (GitHub Pages 배포용)
npm run lint     # ESLint
```

빌드 결과물은 `./out/`에 정적 파일로 출력된다. `output: 'export'`이므로 API 라우트, 서버 컴포넌트의 동적 기능은 사용 불가.

## 배포

`main` 브랜치 push → GitHub Actions(`.github/workflows/deploy.yml`) → `./out/` → GitHub Pages  
URL: `https://hohyun99.github.io/family-calendar/`  
`basePath: '/family-calendar'`가 설정되어 있어 모든 링크/리소스에 자동 적용된다.

## 아키텍처

**완전 정적 앱** — 서버 없음. 모든 데이터는 브라우저 `localStorage`에 저장.

```
src/
  lib/storage.ts        # localStorage CRUD (CalendarEvent)
  types/event.ts        # EventPayload 타입, CalendarEvent re-export
  components/
    Calendar.tsx        # 메인 컨테이너 — 월간 달력 + 알림 시스템 전체
    WeeklyView.tsx      # 주간 일정표 (독립적으로 localStorage 직접 읽음)
    EventForm.tsx       # 일정 추가/수정 폼 (추가·수정 모드 공유)
    VoiceInput.tsx      # Web Speech API 음성 인식 → 텍스트 파싱
    WeatherWidget.tsx   # 수원 날씨·미세먼지 (Open-Meteo API, 클라이언트 fetch)
  app/
    page.tsx            # <Calendar /> 렌더링만
    layout.tsx          # 전역 레이아웃
```

## 알림 시스템 (Calendar.tsx)

이벤트 등록 시 `(start_at - 10분)`에 정확한 `setTimeout`을 예약한다. `setInterval` 폴링(60초)은 안전망 역할.

Chrome 백그라운드 탭 문제를 두 가지로 해결:
- **Web Locks API** (`navigator.locks.request`) — 탭 freeze 방지
- **AudioContext 사일런트 루프** (5초마다 무음 버퍼 재생) — 오디오 서브시스템 유지

`initAudio()`는 사용자 클릭(알림 허용 버튼 또는 소리 테스트 버튼) 시점에 호출해야 한다. Chrome autoplay 정책상 사용자 제스처 없이 AudioContext를 생성하면 `suspended` 상태로 시작되어 소리가 나지 않는다.

알림 순서: 브라우저 Notification → Web Audio 딩동(880Hz) → speechSynthesis TTS → 화면 토스트

## 음성 입력 파싱 (VoiceInput.tsx)

"유찬 내일 오후 3시 수학학원" 형태의 한국어 발화를 정규식으로 파싱.  
가족 구성원: `유찬`, `유주`, `엄마`, `아빠` (MEMBERS 배열에 정의)  
파싱 결과는 `onParsed` 콜백으로 전달되고 `EventForm`에 초기값으로 주입된다.

## 날씨 (WeatherWidget.tsx)

- Open-Meteo Weather API: 온도, WMO 날씨 코드, 강수확률
- Open-Meteo Air Quality API: PM10, PM2.5
- 좌표 고정: 수원 (37.2636, 127.0286)
- API 키 불필요, CORS 허용

## 주요 제약

- `better-sqlite3`, `node-cron`은 `package.json`에 남아있지만 **실제로 사용하지 않는다** (정적 배포 전환 시 제거됨). 빌드 오류 없으나 오해 주의.
- 데이터가 `localStorage`에만 있으므로 기기 간 공유 불가.
- 가족 구성원 목록을 바꾸려면 `Calendar.tsx`의 `MEMBER_COLORS/MEMBER_TEXT/MEMBER_CALL`과 `VoiceInput.tsx`의 `MEMBERS` 배열을 함께 수정해야 한다.
