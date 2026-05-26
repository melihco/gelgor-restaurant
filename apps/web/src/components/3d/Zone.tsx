'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

interface ZoneProps {
  name: string;
  position: [number, number, number];
  size: [number, number];
  color: string;
  type: 'command' | 'creative' | 'technical' | 'analytics' | 'communication';
  isActive?: boolean;
}

export default function Zone({
  name,
  position,
  size,
  color,
  type,
  isActive = false,
}: ZoneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const borderRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const platformHeight = type === 'command' ? 0.15 : 0.08;
  const borderWidth = 0.06;

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      const baseIntensity = isActive ? 0.6 : hovered ? 0.4 : 0.15;
      const pulse = isActive ? Math.sin(t * 2) * 0.15 : 0;
      mat.emissiveIntensity = baseIntensity + pulse;
      mat.opacity = 0.12 + (isActive ? 0.08 : 0) + pulse * 0.05;
    }

    if (borderRef.current) {
      const mat = borderRef.current.material as THREE.MeshStandardMaterial;
      const baseIntensity = isActive ? 1.2 : hovered ? 0.8 : 0.4;
      const pulse = isActive ? Math.sin(t * 3) * 0.3 : 0;
      mat.emissiveIntensity = baseIntensity + pulse;
    }

    if (groupRef.current) {
      const targetY = isActive ? 0.02 : 0;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        position[1] + targetY,
        0.05
      );
    }
  });

  const threeColor = new THREE.Color(color);

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Platform base */}
      <RoundedBox
        args={[size[0], platformHeight, size[1]]}
        radius={0.05}
        smoothness={4}
        position={[0, platformHeight / 2, 0]}
        receiveShadow
        castShadow
      >
        <meshPhysicalMaterial
          color="#0a0a1a"
          roughness={0.3}
          metalness={0.7}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </RoundedBox>

      {/* Glowing floor panel */}
      <mesh
        ref={glowRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, platformHeight + 0.005, 0]}
      >
        <planeGeometry args={[size[0] - 0.3, size[1] - 0.3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.15}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Border edge glow - four edges */}
      {[
        { pos: [0, platformHeight + 0.01, size[1] / 2] as [number, number, number], scale: [size[0], borderWidth, borderWidth] as [number, number, number] },
        { pos: [0, platformHeight + 0.01, -size[1] / 2] as [number, number, number], scale: [size[0], borderWidth, borderWidth] as [number, number, number] },
        { pos: [size[0] / 2, platformHeight + 0.01, 0] as [number, number, number], scale: [borderWidth, borderWidth, size[1]] as [number, number, number] },
        { pos: [-size[0] / 2, platformHeight + 0.01, 0] as [number, number, number], scale: [borderWidth, borderWidth, size[1]] as [number, number, number] },
      ].map((edge, i) => (
        <mesh key={i} ref={i === 0 ? borderRef : undefined} position={edge.pos} scale={edge.scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.4}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}

      {/* Corner accents */}
      {[
        [size[0] / 2, platformHeight + 0.02, size[1] / 2],
        [-size[0] / 2, platformHeight + 0.02, size[1] / 2],
        [size[0] / 2, platformHeight + 0.02, -size[1] / 2],
        [-size[0] / 2, platformHeight + 0.02, -size[1] / 2],
      ].map((pos, i) => (
        <mesh key={`corner-${i}`} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.5}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Zone type decorations */}
      {type === 'command' && (
        <mesh position={[0, platformHeight + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.7, 6]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Zone name label */}
      <Text
        position={[0, 1.8, 0]}
        fontSize={0.35}
        color={color}
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {name}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          toneMapped={false}
        />
      </Text>

      {/* Subtle point light for zone glow */}
      <pointLight
        color={color}
        intensity={isActive ? 2 : 0.5}
        distance={size[0] * 1.5}
        position={[0, 0.5, 0]}
        decay={2}
      />
    </group>
  );
}
