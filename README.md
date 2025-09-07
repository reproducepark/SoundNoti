# SoundNoti

An Android application that detects decibel levels in real-time and sends notifications through Telegram Bot API when the configured threshold is exceeded.

## Features

- **Real-time Sound Detection**: Continuously monitors ambient noise through the microphone
- **Decibel Measurement**: Accurate noise level measurement and display
- **Telegram Notifications**: Instant notifications via Telegram bot when decibel threshold is exceeded
- **Background Execution**: Sound detection functionality maintained even when app is in background

## Installation and Build

### Prerequisites
- Node.js 18+
- npm or yarn
- Android Studio (for Android development)

### Installation
```bash
npm install
```

### Build
```bash
eas build --platform android --profile preview --local
```

## Usage

1. **App Installation**: Install the built APK file on Android device
2. **Permission Setup**: Grant microphone and notification permissions
3. **Telegram Bot Setup**:
   - Create a bot through @BotFather on Telegram
   - Configure bot token and chat ID
4. **Threshold Setup**: Set desired decibel threshold
5. **Start Monitoring**: Launch background service

## Configuration

### Telegram Bot Setup
```
Enter the bot token received from BotFather in the app settings.
To get chat ID, send a message to your bot and check using this API:
https://api.telegram.org/bot<YourBOTToken>/getUpdates
```

### Permission Requirements
- `RECORD_AUDIO`: Microphone access permission
- `FOREGROUND_SERVICE`: Background execution permission
- `POST_NOTIFICATIONS`: Notification sending permission
- `WAKE_LOCK`: Screen lock prevention

## Troubleshooting

### Build Failure
```bash
# Clear cache
rm -rf .expo .expo-shared node_modules/.cache

# Regenerate Android directory
npx expo prebuild --platform android

# Rebuild
eas build --platform android --profile preview --local
```

## License

This project is licensed under the MIT License.
