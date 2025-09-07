## 개요
- Android 전용 Expo 앱으로, 포그라운드 상시 마이크 레벨 모니터링 및 텔레그램 알림 전송

## 핵심 기능
- 실시간 오디오 레벨(dB 추정) 측정 및 화면 표시
- 임계치 초과 시 텔레그램 봇 메시지 전송 (쿨다운 포함)
- 설정 화면: 봇 토큰, 채팅 ID, 임계치 관리 + 테스트 전송

## 기술 스택
- Expo SDK 53 / React Native 0.79
- 오디오: react-native-audio-record (PCM 스트림)
- 저장소: @react-native-async-storage/async-storage
- 유틸: base64-js (PCM 디코딩)

## 화면 구조
- app/_layout.tsx: Stack 라우팅 (index, settings)
- app/index.tsx: 홈(시작/중지, 실시간 dB 표시)
- app/settings.tsx: 설정 입력/저장/테스트 전송

## 설정값 스키마
```
{
  botToken: string,
  chatId: string,
  threshold: number // 0..120 범위 dB (정규화)
}
```

## 알림 정책
- 임계치 초과 시 즉시 1회 전송
- 이후 cooldownMs(기본 60초) 내 재전송 방지

## 보안 고려
- 민감정보(봇 토큰, chatId)는 AsyncStorage에 저장 (암호화는 범위 외)
- 네트워크 오류/401 응답 시 사용자 방해 최소화 (설정 화면에서 확인)


