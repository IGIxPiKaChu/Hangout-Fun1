import * as THREE from 'three';

/**
 * Global WebGL Three.js Particle Burst for Button Clicks & Interactions
 */
class ThreeClickFX {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private particles: Array<{
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    rotationSpeed: THREE.Vector3;
    life: number;
    maxLife: number;
    color: THREE.Color;
  }> = [];
  private isRunning = false;
  private animationFrameId: number | null = null;
  private isInitialized = false;

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Create pointer-events-none overlay canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'three-fx-overlay';
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '9999';
    document.body.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 400;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointerdown', this.onGlobalClick, { passive: true });
  }

  private onResize = () => {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onGlobalClick = (e: PointerEvent) => {
    // Only spawn particle effects on buttons, interactive elements, or chips
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const isInteractive = target.closest('button, a, input, [role="button"], .interactive-click');
    
    // Spawn at click position
    if (isInteractive) {
      this.spawnBurst(e.clientX, e.clientY);
    }
  };

  public spawnBurst(screenX: number, screenY: number, count = 16, colorPalette?: string[]) {
    if (!this.scene || !this.camera) return;

    // Convert screen coordinates to Three.js world space coordinates at camera.position.z
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;

    // Unproject to z = 0 plane
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(this.camera);
    const dir = vector.sub(this.camera.position).normalize();
    const distance = -this.camera.position.z / dir.z;
    const worldPos = this.camera.position.clone().add(dir.multiplyScalar(distance));

    const defaultColors = ['#a855f7', '#ec4899', '#3b82f6', '#06b6d4', '#f59e0b', '#10b981'];
    const palette = colorPalette || defaultColors;

    // Create sparkling 3D geometric crystals/shards
    const geometries = [
      new THREE.TetrahedronGeometry(4 + Math.random() * 3),
      new THREE.OctahedronGeometry(3 + Math.random() * 3),
      new THREE.DodecahedronGeometry(3 + Math.random() * 2),
    ];

    for (let i = 0; i < count; i++) {
      const geom = geometries[Math.floor(Math.random() * geometries.length)];
      const hex = palette[Math.floor(Math.random() * palette.length)];
      const color = new THREE.Color(hex);

      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        wireframe: Math.random() > 0.6,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(worldPos.x, worldPos.y, worldPos.z);

      // Radial burst
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.5 + Math.random() * 5.5;
      const zSpeed = (Math.random() - 0.5) * 4;

      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        zSpeed
      );

      const rotationSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      );

      this.scene.add(mesh);

      this.particles.push({
        mesh,
        velocity,
        rotationSpeed,
        life: 0,
        maxLife: 32 + Math.floor(Math.random() * 16),
        color,
      });
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.tick();
    }
  }

  private tick = () => {
    if (!this.scene || !this.renderer || !this.camera) return;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;

      // Velocity with slight gravity
      p.mesh.position.add(p.velocity);
      p.velocity.y -= 0.12; // gentle gravity
      p.velocity.multiplyScalar(0.96); // drag

      // Rotation
      p.mesh.rotation.x += p.rotationSpeed.x;
      p.mesh.rotation.y += p.rotationSpeed.y;
      p.mesh.rotation.z += p.rotationSpeed.z;

      // Scale down and fade out
      const progress = p.life / p.maxLife;
      const scale = Math.max(0.01, 1 - progress);
      p.mesh.scale.set(scale, scale, scale);

      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - progress);

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (this.particles.length > 0) {
      this.animationFrameId = requestAnimationFrame(this.tick);
    } else {
      this.isRunning = false;
      if (this.renderer) {
        this.renderer.clear();
      }
    }
  };

  public destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerdown', this.onGlobalClick);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

export const threeClickFX = new ThreeClickFX();
