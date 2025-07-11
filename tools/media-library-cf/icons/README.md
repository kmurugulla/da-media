# DA Media Icons

This folder contains SVG icons used throughout the DA Media Library interface.

## Current Icons

- `responsive-preview.svg` - Multi-device preview icon showing desktop, tablet, and mobile devices

## Guidelines

- **Format**: Use SVG for scalability and crisp rendering at any size
- **Size**: Design icons at 16x16px default size with proper viewBox
- **Colors**: Use `fill="currentColor"` for icons that should inherit text color
- **Naming**: Use kebab-case naming convention (e.g., `icon-name.svg`)
- **Optimization**: Keep SVGs clean and minimal for better performance

## Usage

Icons are referenced in CSS using relative paths:
```css
background-image: url('/tools/da-media/icons/icon-name.svg');
```

## Future Icons

Add new icons here following the same naming and format conventions. 