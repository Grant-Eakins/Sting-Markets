import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface SpinningCoin3DProps {
  className?: string;
}

export function SpinningCoin3D({ className }: SpinningCoin3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    model: THREE.Group | null;
    controls: OrbitControls | null;
    animationId: number;
    isDragging: boolean;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // OrbitControls for drag interaction
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;

    // Track if user is dragging
    let isDragging = false;
    controls.addEventListener('start', () => { isDragging = true; });
    controls.addEventListener('end', () => { isDragging = false; });

    // Enhanced golden lighting for clarity
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight1.position.set(5, 5, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffd700, 1.5);
    directionalLight2.position.set(-5, 3, -5);
    scene.add(directionalLight2);

    const pointLight = new THREE.PointLight(0xffffff, 2);
    pointLight.position.set(3, 3, 3);
    scene.add(pointLight);

    // Add extra rim light for shine effect
    const rimLight = new THREE.DirectionalLight(0xffffcc, 2);
    rimLight.position.set(-3, 0, -3);
    scene.add(rimLight);

    // Add specular highlight light
    const specularLight = new THREE.PointLight(0xffffff, 2.5);
    specularLight.position.set(0, 5, 2);
    scene.add(specularLight);

    // Bottom fill light for clarity
    const fillLight = new THREE.DirectionalLight(0xffd700, 1);
    fillLight.position.set(0, -3, 2);
    scene.add(fillLight);

    // Load GLB model
    const loader = new GLTFLoader();
    let model: THREE.Group | null = null;

    loader.load(
      '/gold coinbest.glb',
      (gltf) => {
        model = gltf.scene;
        
        // Apply darker gold material
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Apply darker gold material
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0xd4a500,
              metalness: 0.85,
              roughness: 0.25,
              emissive: 0xb8860b,
              emissiveIntensity: 0.1,
            });
          }
        });

        // Center the model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        model.scale.set(3.0, 3.0, 3.0);
        scene.add(model);
        sceneRef.current = { scene, camera, renderer, model, controls, animationId: 0, isDragging };
      },
      undefined,
      (error) => {
        console.error('Error loading GLB:', error);
      }
    );

    // Animation loop
    const animate = () => {
      const animationId = requestAnimationFrame(animate);
      if (sceneRef.current) {
        sceneRef.current.animationId = animationId;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth || 200;
      const newHeight = containerRef.current.clientHeight || 200;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
      }
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={className} 
      style={{ 
        width: '100%', 
        height: '100%', 
        cursor: 'grab',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    />
  );
}
