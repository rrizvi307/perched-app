# Local Dev Prereqs

## Required tooling
- macOS with Xcode + iOS Simulator installed
- Node `v24.11.1` (pinned in `.nvmrc`)
- npm `>=10`

## Install Node (nvm)
```bash
brew install nvm
mkdir -p ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install
nvm use
node -v
```

## Install Node (Volta alternative)
```bash
brew install volta
volta install node@24.11.1 npm
node -v
```

## Xcode + Simulator sanity checks
```bash
xcode-select -p
xcrun simctl list devices | sed -n '1,120p'
```

## Project setup
```bash
npm install
```

## Full quality gate
```bash
npm run check:all
```

## iOS run (standard for this repo)
The `ios` script pins Metro to a valid port and uses the same value for React Native:
```bash
npm run ios
```
Equivalent explicit command:
```bash
RCT_METRO_PORT=8081 npx expo run:ios --port 8081
```
