# ucl-volunteering
The home of UCL Volunteering Society on the internet, the one stop shop to find all volunteering opportunities and more

## Starter 3D flag component

`UclFlag.jsx` provides a single-file React component that renders a waving 3D flag using `@react-three/fiber` and `@react-three/drei`

- Uses a high-segment plane geometry (`[3, 2, 32, 32]` = width, height, widthSegments, heightSegments)
- Uses a custom shader with animated horizontal wave motion and a pinned left edge
- Supports logo textures via `useTexture`
- Falls back to a UCL purple shimmer if no logo texture URL is provided
- Includes ambient and directional lighting plus orbit controls
