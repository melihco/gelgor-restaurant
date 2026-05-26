'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

type StationState = 'working' | 'idle' | 'blocked' | 'completed';

interface AgentStationProps {
  position: [number, number, number];
  rotationY?: number;
  agentType: string;
  agentName: string;
  state: StationState;
  color: string;
  isSelected?: boolean;
  onPress?: () => void;
}

/* ── Vinyl Platter ── spinning disc with groove rings */
function VinylPlatter({ color, state }: { color: string; state: StationState }) {
  const discRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!discRef.current) return;
    const speed =
      state === 'working' ? 1.2 : state === 'idle' ? 0.06 : state === 'blocked' ? 0 : 0.02;
    discRef.current.rotation.y += speed * delta;
  });

  const grooveRadii = [0.32, 0.44, 0.56, 0.67, 0.78, 0.88];

  return (
    <group ref={discRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[1.0, 48]} />
        <meshPhysicalMaterial
          color="#0d1018"
          roughness={0.35}
          metalness={0.12}
          clearcoat={0.4}
          clearcoatRoughness={0.25}
        />
      </mesh>

      {grooveRadii.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
          <ringGeometry args={[r, r + 0.012, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.05 + i * 0.008}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Center label */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.046, 0]}>
        <circleGeometry args={[0.2, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={state === 'working' ? 0.6 : 0.2}
          roughness={0.3}
          metalness={0.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ── Platter Recess ── circular well + chrome ring */
function PlatterRecess({ color }: { color: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.15, 48]} />
        <meshPhysicalMaterial color="#060810" roughness={0.3} metalness={0.2} clearcoat={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[1.1, 1.15, 48]} />
        <meshStandardMaterial color="#3a3e50" roughness={0.2} metalness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]}>
        <ringGeometry args={[1.15, 1.17, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ── LED Progress Ring ── 24 segments like a CDJ jog wheel */
const LED_COUNT = 24;
const LED_RADIUS = 1.24;

function ProgressLEDs({ color, state }: { color: string; state: StationState }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    let progress = 0;
    if (state === 'working') {
      progress = 0.3 + ((Math.sin(clock.elapsedTime * 0.6) + 1) / 2) * 0.6;
    } else if (state === 'completed') {
      progress = 1;
    } else if (state === 'blocked') {
      progress = Math.sin(clock.elapsedTime * 4) > 0 ? 0.25 : 0.04;
    } else {
      progress = 0.04;
    }

    const activeCount = Math.floor(progress * LED_COUNT);
    groupRef.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      const isLit = i < activeCount;
      mat.emissiveIntensity = isLit ? 1.0 : 0.04;
      mat.opacity = isLit ? 0.9 : 0.1;
    });
  });

  const segments = useMemo(() => {
    return Array.from({ length: LED_COUNT }).map((_, i) => {
      const angle = (i / LED_COUNT) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * LED_RADIUS;
      const z = Math.sin(angle) * LED_RADIUS;
      return { x, z, rotY: -angle };
    });
  }, []);

  return (
    <group ref={groupRef}>
      {segments.map((seg, i) => (
        <mesh key={i} position={[seg.x, 0.03, seg.z]} rotation={[0, seg.rotY, 0]}>
          <boxGeometry args={[0.14, 0.008, 0.04]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.04}
            transparent
            opacity={0.1}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── Avatar Core ── floating octahedron on the platter center */
function AvatarCore({ color, state }: { color: string; state: StationState }) {
  const ref = useRef<THREE.Mesh>(null);
  const liveColor =
    state === 'blocked' ? '#f87171' : state === 'completed' ? '#4ade80' : color;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 0.32 + Math.sin(clock.elapsedTime * 1.5) * 0.04;
    ref.current.rotation.y = clock.elapsedTime * 0.4;
  });

  return (
    <mesh ref={ref} position={[0, 0.32, 0]}>
      <octahedronGeometry args={[0.15, 1]} />
      <meshPhysicalMaterial
        color={liveColor}
        emissive={liveColor}
        emissiveIntensity={state === 'working' ? 1.4 : state === 'blocked' ? 0.8 : 0.35}
        roughness={0.15}
        metalness={0.3}
        clearcoat={0.7}
        clearcoatRoughness={0.1}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ── Status Badge ── dot + label on the surface near platter */
function StatusBadge({ state, color }: { state: StationState; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const liveColor =
    state === 'blocked'
      ? '#f87171'
      : state === 'completed'
        ? '#4ade80'
        : state === 'idle'
          ? '#6b7280'
          : color;

  const label = useMemo(() => {
    const map: Record<StationState, string> = {
      working: 'ACTIVE',
      idle: 'IDLE',
      blocked: 'BLOCKED',
      completed: 'DONE',
    };
    return map[state];
  }, [state]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshStandardMaterial;
    const speed = state === 'blocked' ? 6 : state === 'working' ? 2.5 : 1;
    mat.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * speed) * 0.4;
  });

  return (
    <group position={[0, 0.02, 1.38]}>
      <mesh ref={ref} position={[-0.22, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.04, 10]} />
        <meshStandardMaterial
          color={liveColor}
          emissive={liveColor}
          emissiveIntensity={0.8}
          toneMapped={false}
        />
      </mesh>
      <Text
        position={[-0.12, 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.085}
        color={liveColor}
        anchorX="left"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

/* ── Info Label ── agent name and role below platter */
function InfoLabel({
  agentName,
  agentType,
  color,
}: {
  agentName: string;
  agentType: string;
  color: string;
}) {
  return (
    <group position={[0, 0.02, 1.55]}>
      <Text
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.17}
        color="#e8eaf0"
        anchorX="center"
        anchorY="top"
        position={[0, 0, 0]}
      >
        {agentName}
      </Text>
      <Text
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.09}
        color={color}
        anchorX="center"
        anchorY="top"
        position={[0, 0, 0.22]}
        fillOpacity={0.65}
      >
        {agentType}
      </Text>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AgentStation — the turntable / jog wheel assembly
   ═══════════════════════════════════════════════════════════════ */
export default function AgentStation({
  position,
  rotationY = 0,
  agentType,
  agentName,
  state,
  color,
  isSelected = false,
  onPress,
}: AgentStationProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <PlatterRecess color={color} />
      <VinylPlatter color={color} state={state} />
      <ProgressLEDs color={color} state={state} />
      <AvatarCore color={color} state={state} />
      <StatusBadge state={state} color={color} />
      <InfoLabel agentName={agentName} agentType={agentType} color={color} />

      {/* Selection highlight ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[1.2, 1.42, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.14}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Ambient point light */}
      <pointLight
        color={state === 'blocked' ? '#f87171' : color}
        intensity={state === 'working' ? 0.5 : 0.18}
        distance={3}
        decay={2}
        position={[0, 0.5, 0]}
      />

      {/* Clickable hit area */}
      {onPress && (
        <mesh
          position={[0, 0.3, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onPress();
          }}
          onPointerOver={() => {
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'default';
          }}
        >
          <cylinderGeometry args={[1.3, 1.3, 0.8, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
