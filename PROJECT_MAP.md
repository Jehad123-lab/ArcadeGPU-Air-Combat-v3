# Project Map: ArcadeGPU Flight Simulator

## Overview
ArcadeGPU Flight Simulator is a 3D arcade-style flying combat game built using the **ArcadeGPU** engine. It leverages WebGPU (via high-level abstractions) and Jolt Physics for real-time interaction.

## Architecture
The project follows a modular React architecture for the UI and a custom ECS-like structure for the game logic.

### 📁 /arcadegpu-code
Contains the core engine library.
- `/src/lib/gfx3`: Core rendering abstractions.
- `/src/lib/gfx3_mesh`: Mesh loading and rendering.
- `/src/lib/gfx3_jolt`: Jolt Physics integration.
- `/src/lib/engine`: High-level engine managers.

### 📁 /components/App
Contains the main application logic.
- `App.tsx`: Main entry point for the game screen and input handling.
- `/game`: Game-specific entities.
  - `Plane.ts`: Player-controlled plane entity with physics.
  - `Environment.ts`: Level building and static objects.
  - `Explosion.ts`: Particle effects and visual feedback.

### 📁 /public
Static assets used by the game.
- `/models`: JSM format 3D models.
- `/textures`: UI elements and particle textures.
- `/wasms`: Binary physics engines (Jolt, Box2D).

## Key Workflows
1. **Rendering**: Uses `Gfx3MeshRenderer` with a custom shader stack that supports pixelation and retro effects.
2. **Physics**: Managed by `gfx3JoltManager`. Entities sync their `Gfx3Mesh` position/rotation with `Jolt` bodies every frame.
3. **Flight**: Uses procedural mesh generation with flight dynamics (roll, pitch, yaw) mapped to Jolt body velocity.

## Development Guidelines
- **Models**: Use the JSM format for static meshes.
- **Physics**: Ensure every dynamic entity has a corresponding Jolt body.
- **Performance**: Use `Gfx3Drawable` tags for efficient batching and effect application.
