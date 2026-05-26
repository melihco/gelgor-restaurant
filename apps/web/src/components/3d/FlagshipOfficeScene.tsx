'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  AGENT_FLOW_EDGES,
  FLAGSHIP_AGENTS,
  OFFICE_ZONES,
  agentLayoutById,
} from '@/lib/office-layout';
import { AGENT_COLORS } from '@/lib/mock-data';
import { useOfficeStore } from '@/stores/office-store';
import type { AgentState } from '@/types';
import AgentStation from './AgentStation';
import OfficeArchitecture from './OfficeArchitecture';
import DataFlowLines from './DataFlowLines';
import OfficeFloor from './OfficeFloor';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';

function mapStationState(
  s: AgentState,
): 'working' | 'idle' | 'blocked' | 'completed' {
  if (s === 'error') return 'blocked';
  return s;
}

export default function FlagshipOfficeScene({
  selectedAgentId,
  activeZoneId,
}: {
  selectedAgentId: string | null;
  activeZoneId: string | null;
}) {
  const selectAgent = useOfficeStore((s) => s.selectAgent);
  const selectZone = useOfficeStore((s) => s.selectZone);
  const openPanel = useOfficeStore((s) => s.openPanel);
  const { data } = useDashboardSnapshot();

  const agents = data?.agents ?? [];

  const activeSlots = useMemo(
    () => new Set(agents.map((a) => a.layoutSlotId)),
    [agents],
  );

  const flowEdges = useMemo(() => {
    const pos = (slotId: string) => {
      const layout = FLAGSHIP_AGENTS.find((x) => x.id === slotId);
      if (!layout) return new THREE.Vector3();
      const [x, y, z] = layout.position;
      return new THREE.Vector3(x, y + 0.32, z);
    };
    return AGENT_FLOW_EDGES.filter(
      ([from, to]) => activeSlots.has(from) && activeSlots.has(to),
    ).map(
      ([from, to]) => [pos(from), pos(to)] as [THREE.Vector3, THREE.Vector3],
    );
  }, [activeSlots]);

  return (
    <group>
      <OfficeFloor />
      <OfficeArchitecture activeZoneId={activeZoneId} />
      <DataFlowLines edges={flowEdges} color="#7c8aff" />

      {/* ── Zone click areas (for camera zoom) ── */}
      {OFFICE_ZONES.map((zone) => {
        const [cx, , cz] = zone.center;
        const [w, d] = zone.size;
        return (
          <mesh
            key={`zclick-${zone.id}`}
            position={[cx, 0.001, cz]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (activeZoneId === zone.id) {
                selectZone(null);
              } else {
                selectZone(zone.id);
              }
            }}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'default';
            }}
          >
            <planeGeometry args={[w, d]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}

      {/* ── Agent turntables ── */}
      {agents.map((agent) => {
        const layout = agentLayoutById(agent.layoutSlotId);
        if (!layout) return null;
        const color = AGENT_COLORS[agent.type] ?? '#6366f1';
        return (
          <AgentStation
            key={agent.id}
            position={layout.position}
            rotationY={layout.rotationY}
            agentType={agent.roleLabel}
            agentName={agent.name}
            state={mapStationState(agent.state)}
            color={color}
            isSelected={selectedAgentId === agent.id}
            onPress={() => {
              selectAgent(agent.id, agent.zoneId);
              openPanel('agent');
            }}
          />
        );
      })}
    </group>
  );
}
