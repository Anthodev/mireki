default:
    @just --list

alias bf := build-firefox
alias bc := build-chrome
alias zf := build-firefox-zip
alias zc := build-chrome-zip

build-firefox:
    node tools/build-extension.cjs firefox

build-chrome:
    node tools/build-extension.cjs chrome

build-firefox-zip: build-firefox
    npx --yes web-ext@10.5.0 build --source-dir build/firefox --artifacts-dir web-ext-artifacts --filename mireki-firefox.zip --overwrite-dest

build-chrome-zip: build-chrome
    npx --yes web-ext@10.5.0 build --source-dir build/chrome --artifacts-dir web-ext-artifacts --filename mireki-chrome.zip --overwrite-dest
