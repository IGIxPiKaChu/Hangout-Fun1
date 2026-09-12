import * as THREE from 'three';

/**
 * Three.js Page Transition Holographic Warp Effect
 * Triggers a 3D cosmic warp & light wave whenever switching screens
 */
class ThreeTransitionFX {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private particles: THREE.Points | null = null;
  private particlePositions: Float32Array | null = null;
  private particleColors: Float32Array | null = null;
  private rings: THREE.Mesh[] = [];
  private isWarping = false;
  private warpStartTime = 0;
  private warpDuration = 600; // ms
  private animationFrameId: number | null = null;
  private isInitialized = false;

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'three-transition-canvas';
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '9998';
    this.canvas.style.opacity = '0';
    this.canvas.style.transition = 'opacity 0.2s ease-out';
    document.body.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1500);
    this.camera.position.z = 800;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.buildScene();

    window.addEventListener('resize', this.onResize);
  }

  private buildScene() {
    if (!this.scene) return;

    // 1. Star Tunnel particles
    const particleCount = 650;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorA = new THREE.Color('#9333ea');
    const colorB = new THREE.Color('#3b82f6');
    const colorC = new THREE.Color('#f43f5e');

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      // Cylinder distribution along Z
      const radius = 60 + Math.random() * 450;
      const theta = Math.random() * Math.PI * 2;

      positions[idx] = Math.cos(theta) * radius;
      positions[idx + 1] = Math.sin(theta) * radius;
      positions[idx + 2] = (Math.random() - 0.5) * 1200;

      const pick = Math.random();
      const col = pick < 0.4 ? colorA : pick < 0.7 ? colorB : colorC;
      colors[idx] = col.r;
      colors[idx + 1] = col.g;
      colors[idx + 2] = col.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.particlePositions = positions;
    this.particleColors = colors;
    this.scene.add(this.particles);

    // 2. Neon Ring shockwaves
    for (let i = 0; i < 4; i++) {
      const ringGeom = new THREE.TorusGeometry(120 + i * 80, 2, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x9333ea : 0x06b6d4,
        transparent: true,
        opacity: 0.7,
        wireframe: true,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.z = -200 + i * 150;
      this.scene.add(ring);
      this.rings.push(ring);
    }
  }

  private onResize = () => {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  /**
   * Trigger the 3D transition when switching pages
   */
  public triggerTransition() {
    if (!this.canvas || !this.scene || !this.renderer || !this.camera) return;

    this.warpStartTime = performance.now();
    this.isWarping = true;
    this.canvas.style.opacity = '1';

    if (!this.animationFrameId) {
      this.tick();
    }
  }

  private tick = () => {
    if (!this.scene || !this.renderer || !this.camera) return;

    const now = performance.now();
    const elapsed = now - this.warpStartTime;
    const progress = Math.min(1, elapsed / this.warpDuration);

    // Fast hyperspace acceleration curve
    const speed = Math.sin(progress * Math.PI) * 45;

    // Move starfield particles toward camera
    if (this.particles && this.particlePositions) {
      const positions = this.particlePositions;
      for (let i = 0; i < positions.length / 3; i++) {
        const idx = i * 3 + 2; // z position
        positions[idx] += speed;
        if (positions[idx] > 800) {
          positions[idx] = -500;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.rotation.z += 0.04;
    }

    // Expand shockwave rings
    this.rings.forEach((ring, idx) => {
      ring.rotation.z += 0.03 * (idx % 2 === 0 ? 1 : -1);
      const ringScale = 1 + progress * 2.5;
      ring.scale.set(ringScale, ringScale, ringScale);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - progress));
    });

    this.renderer.render(this.scene, this.camera);

    if (progress < 1) {
      this.animationFrameId = requestAnimationFrame(this.tick);
    } else {
      this.isWarping = false;
      this.animationFrameId = null;
      if (this.canvas) {
        this.canvas.style.opacity = '0';
      }
      if (this.renderer) {
        this.renderer.clear();
      }
    }
  };

  public destroy() {
    window.removeEventListener('resize', this.onResize);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

export const threeTransitionFX = new ThreeTransitionFX();
