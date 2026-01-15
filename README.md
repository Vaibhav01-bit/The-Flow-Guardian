# The Flow Guardian

*Pause, reset, and regain focus with a simple micro-reset experience.*

[![The Flow Guardian](https://img.shields.io/badge/Microsoft%20Edge-Download-blue?logo=microsoft-edge)](https://microsoftedge.microsoft.com/addons/detail/the-flow-guardian/fceijkjinpknogjadaeagphkdkdlohld)

## Preview

![Screenshot 1](assets/Screenshot%202026-01-15%20135421.png)
![Screenshot 2](assets/Screenshot%202026-01-15%20140213.png)

## Description

The Flow Guardian is a calm, minimal browser extension designed for Microsoft Edge that helps you detect mental fatigue and take gentle micro-breaks. Whether you're deep in work or feeling overwhelmed, it offers quick, soothing ways to pause, reset, and refocus your mind.

## Key Features

- 🧠 **Mental Fatigue Detection**: Monitors your browsing patterns to identify signs of fatigue and prompts timely breaks.
- 🌬️ **Breathing Exercises**: Guided breathing sessions to help you relax and center yourself.
- 🧘 **Meditation Sessions**: Short, calming meditations with audio and captions for mindfulness.
- 🔄 **Micro-Resets**: Quick reset options to clear your mind and boost productivity.
- 🔔 **Notifications**: Gentle reminders to take breaks without disrupting your flow.
- 🎨 **Minimalist Design**: Clean, distraction-free interface that blends seamlessly into your browser.

## Install

Get The Flow Guardian directly from the Microsoft Edge Add-ons store:

[Install The Flow Guardian](https://microsoftedge.microsoft.com/addons/detail/the-flow-guardian/fceijkjinpknogjadaeagphkdkdlohld)

## How to Use

1.  Install the extension from the link above.
2.  Click the Flow Guardian icon in your browser toolbar to open the popup.
3.  Choose from options like breathing exercises, meditation, or a quick reset.
4.  Follow the on-screen guidance to complete your micro-break.
5.  Return refreshed and ready to focus.

## For Developers

### Building from Source

To run the extension locally for development:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/the-flow-guardian.git
    cd the-flow-guardian
    ```

2.  **Load the extension in your browser:**
    *   Open Microsoft Edge and navigate to `edge://extensions`.
    *   Enable **"Developer mode"**.
    *   Click **"Load unpacked"**.
    *   Select the `the-flow-guardian` directory that you just cloned.

The extension should now be loaded and active.

### Project Structure

-   `manifest.json`: The core manifest file that defines the extension's properties and permissions.
-   `background.js`: The service worker for handling background tasks like alarms and notifications.
-   `content.js`: Injected into web pages to monitor browsing activity for fatigue detection.
-   `popup.html` / `popup.js`: The main UI and logic for the extension's popup window.
-   `reset.html` / `reset.js`: The page and script for the full-screen reset experience.
-   `style.css`: Shared styles for the popup and other HTML pages.
-   `icons/`: The extension's icons in various sizes.
-   `assets/`: Screenshots and other assets for the README.
-   `package.json`: Contains scripts for development tasks, such as generating icons. Note that the core extension is built with vanilla JavaScript and does not require `npm install` to run.

## Privacy

Your privacy is important. The Flow Guardian is designed to respect your data. All browsing analysis is done locally on your device and is not stored or transmitted. For more details, please read our full [Privacy Policy](privacy.md).

## Contributing

Contributions are welcome! If you have ideas for new features, improvements, or bug fixes, please feel free to:

1.  Open an issue to discuss your ideas.
2.  Fork the repository and create a pull request with your changes.

## Purpose & Vision

In our fast-paced digital world, maintaining mental wellness is crucial. The Flow Guardian is built with a vision of promoting calm and focus through simple, accessible tools. It's not about drastic changes—it's about those small, meaningful pauses that help you stay balanced, productive, and kind to yourself. Embrace the flow of life with gentle resets that nurture your well-being.

