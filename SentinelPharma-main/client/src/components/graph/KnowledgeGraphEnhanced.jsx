/**
 * Enhanced SentinelPharma Knowledge Graph
 * ====================================
 * Advanced interactive knowledge graph with:
 * - Force-directed physics simulation
 * - Interactive filtering and clustering
 * - Path highlighting
 * - Node details with metadata
 * - Export functionality
 * - 3D-like depth visualization
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Network, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  X,
  Pill,
  Dna,
  Activity,
  AlertCircle,
  Info,
  Download,
  Search,
  RefreshCw,
  Eye,
  EyeOff,
  Layers,
  Sparkles,
  Play,
  Pause,
  Route,
  Focus,
  ArrowLeft,
  ArrowRight,
  Keyboard
} from 'lucide-react';

const ENTITY_STYLES = {
  drug: { label: 'Drug', color: '#8B5CF6', light: '#C4B5FD' },
  protein: { label: 'Gene / target', color: '#14B8A6', light: '#99F6E4' },
  pathway: { label: 'Pathway', color: '#F59E0B', light: '#FDE68A' },
  disease: { label: 'Disease', color: '#F43F5E', light: '#FDA4AF' },
  other: { label: 'Other entity', color: '#64748B', light: '#CBD5E1' }
};

const normalizeEntityType = (type = '') => {
  const normalized = String(type).toLowerCase();
  if (['drug', 'compound', 'molecule', 'chemical'].includes(normalized)) return 'drug';
  if (['protein', 'gene', 'target', 'gene_target'].includes(normalized)) return 'protein';
  if (['pathway', 'process', 'biological_process'].includes(normalized)) return 'pathway';
  if (['disease', 'condition', 'indication', 'phenotype'].includes(normalized)) return 'disease';
  return 'other';
};

const relationStyle = (type = '') => {
  const normalized = String(type).toLowerCase();
  if (normalized.includes('bind') || normalized.includes('target')) return { color: '#A78BFA', label: 'Binds / targets' };
  if (normalized.includes('regulat') || normalized.includes('express')) return { color: '#2DD4BF', label: 'Regulates' };
  if (normalized.includes('associat') || normalized.includes('indicat')) return { color: '#FB7185', label: 'Associated with' };
  if (normalized.includes('pathway') || normalized.includes('participat')) return { color: '#FBBF24', label: 'Pathway evidence' };
  return { color: '#94A3B8', label: 'Evidence relationship' };
};

const KnowledgeGraphEnhanced = ({ data, graphData, molecule, researchMode = 'demo' }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [highlightedPath, setHighlightedPath] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [showLabels, setShowLabels] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const animationRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [cameraTilt, setCameraTilt] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState('lab');
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [isPathfinderMode, setIsPathfinderMode] = useState(false);
  const [, setPathSelection] = useState({ from: null, to: null });
  const [pathStatus, setPathStatus] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });

  // Enhanced mock data generator
  const generateEnhancedGraph = useCallback(() => {
    const mockNodes = [];
    const mockEdges = [];
    
    // Central drug node
    mockNodes.push({
      id: 'drug_0',
      label: molecule || 'Drug',
      type: 'drug',
      color: ENTITY_STYLES.drug.color,
      size: 25,
      x: 400,
      y: 300,
      vx: 0,
      vy: 0,
      connections: 0,
      depth: 0.55,
      metadata: {
        type: 'Small Molecule',
        mw: '342.34 g/mol',
        indication: 'Oncology'
      }
    });

    // Generate protein targets with clustering
    const targetCount = 8;
    for (let i = 0; i < targetCount; i++) {
      const angle = (i / targetCount) * 2 * Math.PI;
      const radius = 120;
      mockNodes.push({
        id: `target_${i}`,
        label: ['EGFR', 'VEGFR2', 'mTOR', 'PI3K', 'AKT', 'BRAF', 'MEK', 'ERK'][i] || `Target ${i + 1}`,
        type: 'protein',
        color: ENTITY_STYLES.protein.color,
        size: 18,
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        connections: 0,
        depth: 0.3 + Math.random() * 0.35,
        metadata: {
          family: 'Kinase',
          expression: i % 2 === 0 ? 'High' : 'Medium',
          druggability: Math.random() > 0.3 ? 'High' : 'Medium'
        }
      });
      mockEdges.push({
        source: 'drug_0',
        target: `target_${i}`,
        type: 'binds',
        strength: Math.random(),
        weight: 2
      });
    }

    // Generate pathways
    const pathways = [
      { name: 'MAPK/ERK', related: [2, 5, 6, 7] },
      { name: 'PI3K/AKT/mTOR', related: [2, 3, 4] },
      { name: 'Angiogenesis', related: [1, 2] },
      { name: 'Apoptosis', related: [0, 3, 4] }
    ];

    pathways.forEach((pathway, i) => {
      const angle = (i / pathways.length) * 2 * Math.PI + Math.PI / 6;
      const radius = 220;
      mockNodes.push({
        id: `pathway_${i}`,
        label: pathway.name,
        type: 'pathway',
        color: ENTITY_STYLES.pathway.color,
        size: 20,
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        connections: 0,
        depth: 0.55 + Math.random() * 0.25,
        metadata: {
          genes: pathway.related.length,
          relevance: Math.random() > 0.5 ? 'High' : 'Medium'
        }
      });
      
      // Connect pathways to targets
      pathway.related.forEach(targetIdx => {
        mockEdges.push({
          source: `target_${targetIdx}`,
          target: `pathway_${i}`,
          type: 'regulates',
          strength: Math.random() * 0.5 + 0.5,
          weight: 1.5
        });
      });
    });

    // Generate disease nodes
    const diseases = ['Cancer', 'Inflammation', 'Fibrosis'];
    diseases.forEach((disease, i) => {
      const angle = (i / diseases.length) * 2 * Math.PI - Math.PI / 4;
      const radius = 300;
      mockNodes.push({
        id: `disease_${i}`,
        label: disease,
        type: 'disease',
        color: ENTITY_STYLES.disease.color,
        size: 22,
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        connections: 0,
        depth: 0.15 + Math.random() * 0.25,
        metadata: {
          prevalence: i === 0 ? 'High' : 'Medium',
          severity: 'High'
        }
      });
      
      // Connect diseases to pathways
      const pathwayIndices = i === 0 ? [0, 1] : i === 1 ? [0, 2] : [1, 3];
      pathwayIndices.forEach(pIdx => {
        mockEdges.push({
          source: `pathway_${pIdx}`,
          target: `disease_${i}`,
          type: 'associated_with',
          strength: Math.random() * 0.3 + 0.7,
          weight: 2
        });
      });
    });

    // Calculate connections for sizing
    mockEdges.forEach(edge => {
      const source = mockNodes.find(n => n.id === edge.source);
      const target = mockNodes.find(n => n.id === edge.target);
      if (source) source.connections++;
      if (target) target.connections++;
    });

    return { nodes: mockNodes, edges: mockEdges };
  }, [molecule]);

  // Initialize graph
  useEffect(() => {
    if (graphData?.nodes && Array.isArray(graphData.nodes)) {
      setNodes(
        graphData.nodes.map((node, index) => {
          const normalizedType = normalizeEntityType(node.type);
          const angle = (index / Math.max(graphData.nodes.length, 1)) * Math.PI * 2;
          const radius = normalizedType === 'drug' ? 0 : normalizedType === 'protein' ? 120 : normalizedType === 'pathway' ? 220 : 290;
          return {
          ...node,
          type: normalizedType,
          color: ENTITY_STYLES[normalizedType].color,
          size: node.size || (normalizedType === 'drug' ? 25 : normalizedType === 'disease' ? 22 : 18),
          x: typeof node.x === 'number' ? node.x : 400 + Math.cos(angle) * radius,
          y: typeof node.y === 'number' ? node.y : 300 + Math.sin(angle) * radius,
          vx: typeof node.vx === 'number' ? node.vx : 0,
          vy: typeof node.vy === 'number' ? node.vy : 0,
          connections: typeof node.connections === 'number' ? node.connections : 0,
          depth: typeof node.depth === 'number'
            ? node.depth
            : normalizedType === 'drug'
              ? 0.55
              : normalizedType === 'pathway'
                ? 0.7
                : normalizedType === 'protein'
                  ? 0.45
                  : 0.3
          };
        })
      );
      setEdges(graphData.edges || []);
    } else if (researchMode !== 'live') {
      const generated = generateEnhancedGraph(data || {});
      setNodes(generated.nodes);
      setEdges(generated.edges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [graphData, data, generateEnhancedGraph, researchMode]);

  // Physics simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const simulate = () => {
      setNodes(prevNodes => {
        const newNodes = [...prevNodes];
        
        // Apply forces
        newNodes.forEach((node, i) => {
          let fx = 0, fy = 0;
          
          // Repulsion between nodes
          newNodes.forEach((other, j) => {
            if (i !== j) {
              const dx = node.x - other.x;
              const dy = node.y - other.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = 5000 / (dist * dist);
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
          });
          
          // Attraction along edges
          edges.forEach(edge => {
            if (edge.source === node.id) {
              const target = newNodes.find(n => n.id === edge.target);
              if (target) {
                const dx = target.x - node.x;
                const dy = target.y - node.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (dist - 100) * 0.01 * (edge.weight || 1);
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
              }
            }
            if (edge.target === node.id) {
              const source = newNodes.find(n => n.id === edge.source);
              if (source) {
                const dx = source.x - node.x;
                const dy = source.y - node.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (dist - 100) * 0.01 * (edge.weight || 1);
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
              }
            }
          });
          
          // Center attraction
          const centerX = 400;
          const centerY = 300;
          const dx = centerX - node.x;
          const dy = centerY - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          fx += (dx / dist) * 0.5;
          fy += (dy / dist) * 0.5;
          
          // Apply forces with damping
          node.vx = (node.vx + fx) * 0.85;
          node.vy = (node.vy + fy) * 0.85;
          node.x += node.vx;
          node.y += node.vy;
          
          // Boundary constraints
          node.x = Math.max(50, Math.min(750, node.x));
          node.y = Math.max(50, Math.min(550, node.y));
        });
        
        return newNodes;
      });
      
      animationRef.current = requestAnimationFrame(simulate);
    };

    // Run simulation for 300 frames, then slow down
    let frameCount = 0;
    const limitedSimulate = () => {
      simulate();
      frameCount++;
      if (frameCount < 300) {
        requestAnimationFrame(limitedSimulate);
      }
    };
    
    limitedSimulate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [edges, nodes.length]);

  // Filter nodes based on type
  const filteredNodes = useMemo(() => {
    let filtered = nodes;
    
    if (filterType !== 'all') {
      filtered = filtered.filter(n => n.type === filterType);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(n => 
        String(n.label || n.id).toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  }, [nodes, filterType, searchTerm]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Apply transforms
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const projectNode = (node) => {
      const depth = typeof node.depth === 'number' ? node.depth : 0.5;
      const perspective = 0.72 + depth * 0.65;
      const depthOffsetX = cameraTilt.x * (depth - 0.5) * 120;
      const depthOffsetY = cameraTilt.y * (depth - 0.5) * 95 - (depth - 0.5) * 28;
      return {
        x: node.x + depthOffsetX,
        y: node.y + depthOffsetY,
        scale: perspective,
        depth
      };
    };

    const projected = new Map();
    nodes.forEach((node) => {
      projected.set(node.id, projectNode(node));
    });

    const traceNodeShape = (node, projectedNode, radius) => {
      ctx.beginPath();
      if (node.type === 'disease') {
        ctx.moveTo(projectedNode.x, projectedNode.y - radius);
        ctx.lineTo(projectedNode.x + radius, projectedNode.y);
        ctx.lineTo(projectedNode.x, projectedNode.y + radius);
        ctx.lineTo(projectedNode.x - radius, projectedNode.y);
        ctx.closePath();
        return;
      }
      if (node.type === 'protein') {
        for (let i = 0; i < 6; i += 1) {
          const angle = Math.PI / 3 * i - Math.PI / 2;
          const px = projectedNode.x + Math.cos(angle) * radius;
          const py = projectedNode.y + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        return;
      }
      if (node.type === 'pathway') {
        ctx.rect(projectedNode.x - radius * 1.15, projectedNode.y - radius * 0.72, radius * 2.3, radius * 1.44);
        return;
      }
      ctx.arc(projectedNode.x, projectedNode.y, radius, 0, 2 * Math.PI);
    };

    // Low-contrast scanlines keep the dense canvas legible without competing with nodes.
    ctx.fillStyle = 'rgba(148, 163, 184, 0.018)';
    for (let y = 0; y < height; y += 8) {
      ctx.fillRect(0, y, width, 1);
    }

    const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));

    // Draw only relationships whose endpoints are currently visible.
    edges.forEach(edge => {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return;
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (source && target) {
        const sourceProjected = projected.get(source.id);
        const targetProjected = projected.get(target.id);
        if (!sourceProjected || !targetProjected) return;

        const isHighlighted = highlightedPath.includes(edge.source) && highlightedPath.includes(edge.target);
        const avgDepth = (sourceProjected.depth + targetProjected.depth) / 2;
        const baseAlpha = 0.18 + avgDepth * 0.38;
        const semantic = relationStyle(edge.type);
        const isSelectedRelationship = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);
        
        ctx.beginPath();
        ctx.moveTo(sourceProjected.x, sourceProjected.y);
        ctx.lineTo(targetProjected.x, targetProjected.y);
        ctx.strokeStyle = isHighlighted
          ? semantic.color
          : `${semantic.color}${Math.round(Math.min(0.78, baseAlpha * (edge.strength || 0.6)) * 255).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = isHighlighted ? 3.2 : (1.1 + avgDepth) * (edge.weight || 1);
        ctx.setLineDash(String(edge.type || '').toLowerCase().includes('associat') ? [6, 5] : []);
        if (isHighlighted) {
          ctx.shadowColor = semantic.color;
          ctx.shadowBlur = 10;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        
        // Directional arrowheads communicate relationship flow.
        if (isHighlighted || isSelectedRelationship) {
          const angle = Math.atan2(targetProjected.y - sourceProjected.y, targetProjected.x - sourceProjected.x);
          const arrowSize = isHighlighted ? 8 : 6;
          ctx.fillStyle = semantic.color;
          ctx.beginPath();
          ctx.moveTo(
            targetProjected.x - arrowSize * Math.cos(angle - Math.PI / 6),
            targetProjected.y - arrowSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(targetProjected.x, targetProjected.y);
          ctx.lineTo(
            targetProjected.x - arrowSize * Math.cos(angle + Math.PI / 6),
            targetProjected.y - arrowSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.fill();
        }

        if (isSelectedRelationship && edge.type) {
          const midX = (sourceProjected.x + targetProjected.x) / 2;
          const midY = (sourceProjected.y + targetProjected.y) / 2;
          const label = String(edge.type).replace(/_/g, ' ');
          ctx.font = '500 10px Inter';
          const labelWidth = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(midX - labelWidth / 2 - 4, midY - 8, labelWidth + 8, 15);
          ctx.fillStyle = '#E2E8F0';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, midX, midY - 0.5);
        }
      }
    });

    // Draw nodes
    [...filteredNodes]
      .sort((a, b) => ((a.depth || 0.5) - (b.depth || 0.5)))
      .forEach(node => {
      const projectedNode = projected.get(node.id);
      if (!projectedNode) return;

      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const isInPath = highlightedPath.includes(node.id);
      const radius = (node.size || 18) * projectedNode.scale * (isSelected ? 1.26 : isHovered ? 1.12 : 1);

      // Node shadow for depth
      if (isSelected || isHovered || isInPath) {
        ctx.beginPath();
        ctx.arc(projectedNode.x + 3, projectedNode.y + 3, radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
        ctx.fill();
      }

      // Depth halo
      ctx.beginPath();
      ctx.arc(projectedNode.x, projectedNode.y, radius * 1.55, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(34, 211, 238, ${0.035 + projectedNode.depth * 0.055})`;
      ctx.fill();

      // Shape and color both encode biomedical entity class.
      traceNodeShape(node, projectedNode, radius);
      
      // Gradient fill
      const gradient = ctx.createRadialGradient(projectedNode.x - radius / 3, projectedNode.y - radius / 3, 0, projectedNode.x, projectedNode.y, radius);
      gradient.addColorStop(0, lightenColor(node.color, 20));
      gradient.addColorStop(1, node.color);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Node border
      if (isSelected || isHovered || isInPath) {
        ctx.strokeStyle = isSelected ? '#1F2937' : isInPath ? '#8B5CF6' : '#6B7280';
        ctx.lineWidth = isSelected ? 4 : 3;
        ctx.stroke();
      }

      // Connection indicator
      if (node.connections > 0) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.connections, projectedNode.x, projectedNode.y);
      }

      // Node label
      if (showLabels || isHovered || isSelected) {
        ctx.fillStyle = '#0F172A';
        ctx.font = `${isSelected ? 'bold ' : ''}12px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // Label background
        const textWidth = ctx.measureText(node.label).width;
        ctx.fillStyle = 'rgba(236, 254, 255, 0.92)';
        ctx.fillRect(projectedNode.x - textWidth / 2 - 5, projectedNode.y + radius + 3, textWidth + 10, 18);
        
        ctx.fillStyle = '#0F172A';
        ctx.fillText(node.label, projectedNode.x, projectedNode.y + radius + 6);
      }
    });

    ctx.restore();
  }, [nodes, edges, zoom, pan, hoveredNode, selectedNode, showLabels, highlightedPath, filteredNodes, cameraTilt]);

  // Helper function to lighten colors
  const lightenColor = (color, percent) => {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  };

  // Mouse handlers
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const x = (canvasX - pan.x) / zoom;
    const y = (canvasY - pan.y) / zoom;

    const clickedNode = filteredNodes.find(node => {
      const depth = typeof node.depth === 'number' ? node.depth : 0.5;
      const projectedX = node.x + cameraTilt.x * (depth - 0.5) * 120;
      const projectedY = node.y + cameraTilt.y * (depth - 0.5) * 95 - (depth - 0.5) * 28;
      const projectedSize = (node.size || 18) * (0.72 + depth * 0.65);
      const dx = projectedX - x;
      const dy = projectedY - y;
      return Math.sqrt(dx * dx + dy * dy) < projectedSize;
    });

    if (clickedNode) {
      if (isPathfinderMode) {
        setPathSelection((prev) => {
          if (!prev.from || (prev.from && prev.to)) {
            setPathStatus(`Source selected: ${clickedNode.label}. Pick destination.`);
            setHighlightedPath([clickedNode.id]);
            return { from: clickedNode.id, to: null };
          }

          const nextSelection = { from: prev.from, to: clickedNode.id };
          const path = findShortestPath(prev.from, clickedNode.id, edges);
          if (path.length > 0) {
            setHighlightedPath(path);
            const fromLabel = nodes.find((n) => n.id === prev.from)?.label || prev.from;
            setPathStatus(`Path found: ${fromLabel} -> ${clickedNode.label} (${path.length - 1} hops)`);
          } else {
            setHighlightedPath([prev.from, clickedNode.id]);
            setPathStatus('No traversable path found for selected nodes');
          }
          return nextSelection;
        });
      }

      setSelectedNode(selectedNode?.id === clickedNode.id ? null : clickedNode);
      
      // Highlight connected nodes
      if (!isPathfinderMode) {
        const connected = [clickedNode.id];
        edges.forEach(edge => {
          if (edge.source === clickedNode.id) connected.push(edge.target);
          if (edge.target === clickedNode.id) connected.push(edge.source);
        });
        setHighlightedPath(connected);
      }
    } else {
      setSelectedNode(null);
      if (!isPathfinderMode) {
        setHighlightedPath([]);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const x = (canvasX - pan.x) / zoom;
    const y = (canvasY - pan.y) / zoom;
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    setCameraTilt({
      x: (relX - 0.5) * 1.4,
      y: (relY - 0.5) * 1.2
    });

    const hoveredNode = filteredNodes.find(node => {
      const depth = typeof node.depth === 'number' ? node.depth : 0.5;
      const projectedX = node.x + cameraTilt.x * (depth - 0.5) * 120;
      const projectedY = node.y + cameraTilt.y * (depth - 0.5) * 95 - (depth - 0.5) * 28;
      const projectedSize = (node.size || 18) * (0.72 + depth * 0.65);
      const dx = projectedX - x;
      const dy = projectedY - y;
      return Math.sqrt(dx * dx + dy * dy) < projectedSize;
    });

    setHoveredNode(hoveredNode);
    canvas.style.cursor = hoveredNode ? 'pointer' : isPanning ? 'grabbing' : 'grab';
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) { // Left click
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const findShortestPath = (start, end, graphEdges) => {
    if (!start || !end || start === end) return start && end ? [start] : [];

    const adjacency = new Map();
    graphEdges.forEach((edge) => {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    });

    const queue = [[start]];
    const visited = new Set([start]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      const neighbors = adjacency.get(current) || [];

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        const nextPath = [...path, neighbor];
        if (neighbor === end) {
          return nextPath;
        }
        visited.add(neighbor);
        queue.push(nextPath);
      }
    }

    return [];
  };

  const focusSelectedNode = () => {
    if (!selectedNode) return;

    const targetZoom = 1.45;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    setZoom(targetZoom);
    setPan({
      x: centerX - selectedNode.x * targetZoom,
      y: centerY - selectedNode.y * targetZoom
    });
  };

  const handleWheelZoom = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.09 : 0.09;
    setZoom((z) => Math.max(0.45, Math.min(2.2, z + delta)));
  };

  useEffect(() => {
    const updateCanvasSize = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCanvasSize({ width: rect.width, height: rect.height });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isOrbiting && viewMode !== 'cinematic') return;

    let raf = null;
    const start = performance.now();

    const animate = (time) => {
      if (isPanning) {
        raf = requestAnimationFrame(animate);
        return;
      }

      const t = (time - start) / 1000;
      const ampX = viewMode === 'cinematic' ? 0.45 : 0.32;
      const ampY = viewMode === 'cinematic' ? 0.32 : 0.22;
      setCameraTilt({
        x: Math.sin(t * 0.55) * ampX,
        y: Math.cos(t * 0.38) * ampY
      });

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isOrbiting, viewMode, isPanning]);

  const minimapViewport = useMemo(() => {
    const mapWidth = 170;
    const mapHeight = 120;
    const worldWidth = 800;
    const worldHeight = 600;

    const worldX = -pan.x / zoom;
    const worldY = -pan.y / zoom;
    const worldViewWidth = (canvasSize.width || 800) / zoom;
    const worldViewHeight = (canvasSize.height || 500) / zoom;

    const x = Math.max(0, Math.min(mapWidth, (worldX / worldWidth) * mapWidth));
    const y = Math.max(0, Math.min(mapHeight, (worldY / worldHeight) * mapHeight));
    const width = Math.max(14, Math.min(mapWidth, (worldViewWidth / worldWidth) * mapWidth));
    const height = Math.max(12, Math.min(mapHeight, (worldViewHeight / worldHeight) * mapHeight));

    return { x, y, width, height, mapWidth, mapHeight };
  }, [pan, zoom, canvasSize]);

  const getNodeIcon = (type) => {
    switch (type) {
      case 'drug': return Pill;
      case 'protein': return Dna;
      case 'pathway': return Activity;
      case 'disease': return AlertCircle;
      default: return Network;
    }
  };

  const nodeTypes = [
    { id: 'all', label: 'All entities', count: nodes.length },
    { id: 'drug', label: 'Drugs', count: nodes.filter(n => n.type === 'drug').length },
    { id: 'protein', label: 'Genes / targets', count: nodes.filter(n => n.type === 'protein').length },
    { id: 'pathway', label: 'Pathways', count: nodes.filter(n => n.type === 'pathway').length },
    { id: 'disease', label: 'Diseases', count: nodes.filter(n => n.type === 'disease').length },
    ...(nodes.some((node) => node.type === 'other') ? [{ id: 'other', label: 'Other', count: nodes.filter((node) => node.type === 'other').length }] : [])
  ];

  const relationshipTypes = Array.from(new Set(edges.map((edge) => edge.type).filter(Boolean)));
  const selectedRelationships = selectedNode
    ? edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
    : [];
  const searchMatches = searchTerm.trim() ? filteredNodes.slice(0, 8) : [];

  const selectEntity = (node) => {
    if (!node) return;
    setSelectedNode(node);
    const connected = [node.id];
    edges.forEach((edge) => {
      if (edge.source === node.id) connected.push(edge.target);
      if (edge.target === node.id) connected.push(edge.source);
    });
    setHighlightedPath(connected);
  };

  return (
    <div className={`research-graph-shell ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Header */}
      <div className="research-graph-toolbar">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="research-graph-brand-icon">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Relationship explorer</p>
              <h3 className="text-lg font-semibold text-slate-50">Biomedical knowledge graph</h3>
              <p className="text-xs text-slate-400">Drug → target → pathway → disease evidence network</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <div className="mr-1 hidden items-center rounded-lg border border-slate-700 bg-slate-900 p-1 md:flex" aria-label="Graph view mode">
              <button
                onClick={() => setViewMode('lab')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${viewMode === 'lab' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                aria-pressed={viewMode === 'lab'}
              >
                Lab 3D
              </button>
              <button
                onClick={() => setViewMode('cinematic')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${viewMode === 'cinematic' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                aria-pressed={viewMode === 'cinematic'}
              >
                Cinematic
              </button>
            </div>

            {/* Zoom Controls */}
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
              className="research-graph-icon-button"
              title="Zoom Out"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-11 text-center font-mono text-[11px] text-slate-400">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.2))}
              className="research-graph-icon-button"
              title="Zoom In"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            
            {/* Reset View */}
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="research-graph-icon-button"
              title="Reset View"
              aria-label="Reset graph view"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <button
              onClick={() => setIsOrbiting((v) => !v)}
              className={`research-graph-icon-button ${isOrbiting ? 'research-graph-icon-button--active' : ''}`}
              title={isOrbiting ? 'Pause Orbit' : 'Start Orbit'}
              aria-label={isOrbiting ? 'Pause orbit' : 'Start orbit'}
              aria-pressed={isOrbiting}
            >
              {isOrbiting ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <button
              onClick={focusSelectedNode}
              className="research-graph-icon-button"
              title="Focus Selected Node"
              disabled={!selectedNode}
              aria-label="Focus selected node"
            >
              <Focus className="h-4 w-4" />
            </button>
            
            {/* Toggle Labels */}
            <button
              onClick={() => setShowLabels(!showLabels)}
              className="research-graph-icon-button"
              title={showLabels ? 'Hide Labels' : 'Show Labels'}
              aria-label={showLabels ? 'Hide node labels' : 'Show node labels'}
              aria-pressed={showLabels}
            >
              {showLabels ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            
            {/* Fullscreen */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="research-graph-icon-button"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            
            {/* Export */}
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                const link = document.createElement('a');
                link.download = `knowledge-graph-${molecule || 'drug'}.png`;
                link.href = canvas.toDataURL();
                link.click();
              }}
              className="research-graph-icon-button"
              title="Export as Image"
              aria-label="Export graph as image"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {/* Search */}
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              aria-label="Search graph entities"
              role="combobox"
              aria-expanded={searchMatches.length > 0}
              aria-controls="graph-search-results"
            />
          </div>
          
          {/* Type Filter */}
          <div className="flex flex-1 items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            {nodeTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setFilterType(type.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                  filterType === type.id
                    ? 'border-slate-500 bg-slate-700 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-white'
                }`}
                aria-pressed={filterType === type.id}
              >
                {type.id !== 'all' && <span className={`research-graph-filter-shape research-graph-filter-shape--${type.id}`} />}
                {type.label} ({type.count})
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setIsPathfinderMode((prev) => {
                const next = !prev;
                if (!next) {
                  setPathSelection({ from: null, to: null });
                  setPathStatus('');
                  setHighlightedPath([]);
                } else {
                  setPathStatus('Pathfinder enabled: select source and destination nodes');
                }
                return next;
              });
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${isPathfinderMode ? 'border-violet-400/60 bg-violet-500/20 text-violet-100' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'}`}
            aria-pressed={isPathfinderMode}
          >
            <span className="inline-flex items-center gap-1">
              <Route className="w-3.5 h-3.5" />
              Pathfinder
            </span>
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>Showing <strong className="text-slate-300">{filteredNodes.length}</strong> of {nodes.length} entities</span>
          <span className="inline-flex items-center gap-1"><Keyboard className="h-3.5 w-3.5" />Search results can be selected with the keyboard</span>
        </div>

        {searchTerm.trim() && (
          <div id="graph-search-results" role="listbox" aria-label="Matching graph entities" className="research-graph-search-results">
            {searchMatches.length > 0 ? searchMatches.map((node) => {
              const Icon = getNodeIcon(node.type);
              return (
                <button
                  key={`search-${node.id}`}
                  type="button"
                  role="option"
                  aria-selected={selectedNode?.id === node.id}
                  onClick={() => selectEntity(node)}
                  className="research-graph-search-result"
                >
                  <span className="research-graph-search-result__icon" style={{ color: ENTITY_STYLES[node.type]?.light, background: `${ENTITY_STYLES[node.type]?.color}22` }}><Icon className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0"><span className="block truncate font-semibold text-slate-200">{node.label || node.id}</span><span className="block truncate text-[10px] text-slate-500">{ENTITY_STYLES[node.type]?.label || 'Other entity'} · {node.id}</span></span>
                </button>
              );
            }) : <p className="px-3 py-2 text-xs text-slate-500">No entities match “{searchTerm}” in this filter.</p>}
          </div>
        )}

        {pathStatus && (
          <div className="mt-3 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100" role="status">
            {pathStatus}
          </div>
        )}
      </div>
      
      <div className="flex flex-col xl:flex-row">
        {/* Graph Canvas */}
        <div className={`relative flex-1 overflow-hidden ${isFullscreen ? 'h-[calc(100vh-16rem)]' : 'h-[560px]'} bg-[#07100f]`}>
          <div className={`pointer-events-none absolute inset-0 ${viewMode === 'cinematic' ? 'bg-[radial-gradient(circle_at_20%_18%,rgba(139,92,246,0.16),transparent_34%),radial-gradient(circle_at_80%_84%,rgba(20,184,166,0.15),transparent_36%)]' : 'bg-[radial-gradient(circle_at_20%_18%,rgba(139,92,246,0.09),transparent_36%),radial-gradient(circle_at_80%_84%,rgba(20,184,166,0.08),transparent_38%)]'}`} />
          <div className="pointer-events-none absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          {viewMode === 'cinematic' && (
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(125,211,252,0.22) 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: 0.12 }} />
          )}
          <canvas
            ref={canvasRef}
            width={isFullscreen ? window.innerWidth - 400 : 800}
            height={isFullscreen ? window.innerHeight - 256 : 500}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheelZoom}
            className="h-full w-full cursor-grab active:cursor-grabbing"
            aria-label="Interactive biomedical knowledge graph. Click a node to inspect its relationships."
          />
          
          {/* Legend */}
          <div className="research-graph-overlay bottom-4 left-4 max-w-[calc(100%-2rem)]">
            <div className="mb-2 flex items-center text-xs font-semibold text-slate-200">
              <Layers className="w-3 h-3 mr-1" />
              Entity legend
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(ENTITY_STYLES).filter(([type]) => type !== 'other' || nodes.some((node) => node.type === 'other')).map(([type, item]) => (
                <div key={type} className="flex items-center space-x-2">
                  <span className={`research-graph-legend-shape research-graph-legend-shape--${type}`} style={{ '--legend-color': item.color }} />
                  <span className="text-[11px] text-slate-300">{item.label}</span>
                </div>
              ))}
            </div>
            {relationshipTypes.length > 0 && <div className="mt-3 border-t border-slate-700 pt-2"><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Relationships</div><div className="flex max-w-sm flex-wrap gap-x-3 gap-y-1">{relationshipTypes.map((type) => <span key={type} className="inline-flex items-center gap-1.5 text-[10px] text-slate-400"><span className="h-px w-4" style={{ background: relationStyle(type).color }} />{String(type).replace(/_/g, ' ')}</span>)}</div></div>}
          </div>
          
          {/* Instructions */}
          <div className="research-graph-overlay left-4 top-4 hidden sm:block">
            <div className="space-y-1 text-[11px] text-slate-400">
              <div><strong className="text-slate-200">Drag</strong> to pan · <strong className="text-slate-200">Scroll</strong> to zoom</div>
              <div><strong className="text-slate-200">Select</strong> a node to inspect evidence links</div>
            </div>
          </div>

          <div className="research-graph-overlay bottom-4 right-4 hidden p-2.5 sm:block">
            <div className="mb-1.5 flex items-center gap-1 text-[10px] text-slate-400">
              <Sparkles className="w-3 h-3" />
              Minimap
            </div>
            <div className="relative" style={{ width: `${minimapViewport.mapWidth}px`, height: `${minimapViewport.mapHeight}px` }}>
              <div className="absolute inset-0 rounded-lg bg-[#04111d] border border-cyan-400/20" />
              {nodes.map((node) => (
                <span
                  key={`mini-${node.id}`}
                  className="absolute rounded-full"
                  style={{
                    left: `${(node.x / 800) * minimapViewport.mapWidth}px`,
                    top: `${(node.y / 600) * minimapViewport.mapHeight}px`,
                    width: '4px',
                    height: '4px',
                    background: node.color,
                    boxShadow: '0 0 4px rgba(125,211,252,0.5)'
                  }}
                />
              ))}
              <div
                className="absolute border border-cyan-200/70 bg-cyan-300/10 rounded"
                style={{
                  left: `${minimapViewport.x}px`,
                  top: `${minimapViewport.y}px`,
                  width: `${minimapViewport.width}px`,
                  height: `${minimapViewport.height}px`
                }}
              />
            </div>
          </div>
        </div>
        
        {/* Node Details Panel */}
        <aside className={`${isFullscreen ? 'xl:w-96' : 'xl:w-80'} min-h-64 w-full overflow-y-auto border-t border-slate-800 bg-[#0b1413] xl:border-l xl:border-t-0`} aria-label="Selected entity details">
          {selectedNode ? (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Selected entity</p><h4 className="font-semibold text-slate-100">Details and relationships</h4></div>
                <button
                  onClick={() => {
                    setSelectedNode(null);
                    setHighlightedPath([]);
                  }}
                  className="research-graph-icon-button"
                  aria-label="Clear selected node"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {/* Node Info */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div 
                    className="flex h-12 w-12 items-center justify-center rounded-xl shadow-lg"
                    style={{ backgroundColor: selectedNode.color }}
                  >
                    {(() => {
                      const Icon = getNodeIcon(selectedNode.type);
                      return <Icon className="w-6 h-6 text-white" />;
                    })()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-50">{selectedNode.label}</div>
                    <div className="text-sm text-slate-400">{ENTITY_STYLES[selectedNode.type]?.label || selectedNode.type}</div>
                  </div>
                </div>
                
                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="research-graph-metric">
                    <div className="text-xs text-slate-500">Relationships</div>
                    <div className="text-xl font-bold text-slate-100">{selectedRelationships.length}</div>
                  </div>
                  <div className="research-graph-metric">
                    <div className="text-xs text-slate-500">Entity ID</div>
                    <div className="mt-1 truncate font-mono text-xs font-semibold text-slate-200" title={selectedNode.id}>{selectedNode.id}</div>
                  </div>
                </div>
                
                {/* Metadata */}
                {selectedNode.metadata && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-200">Entity metadata</div>
                    <div className="space-y-1.5">
                      {Object.entries(selectedNode.metadata).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-slate-800 pb-1.5 text-sm last:border-0">
                          <span className="capitalize text-slate-500">{key.replace(/_/g, ' ')}</span>
                          <span className="max-w-40 break-words text-right font-medium text-slate-200">{value && typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Connected Nodes */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-200"><span>Evidence relationships</span><span className="font-mono text-[10px] text-slate-500">{selectedRelationships.length}</span></div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {selectedRelationships.map((edge, i) => {
                        const isOutgoing = edge.source === selectedNode.id;
                        const connectedId = isOutgoing ? edge.target : edge.source;
                        const connectedNode = nodes.find(n => n.id === connectedId);
                        return (
                          <button
                            key={i}
                            onClick={() => selectEntity(connectedNode)}
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2 text-left text-xs transition-colors hover:border-slate-700 hover:bg-slate-800"
                          >
                            <span className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ENTITY_STYLES[connectedNode?.type || 'other'].color }} /><span className="truncate font-medium text-slate-200">{connectedNode?.label || connectedId}</span></span><span className="text-slate-500">{isOutgoing ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}</span></span>
                            <span className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-800 pt-1.5"><span className="text-[10px] text-slate-500">{isOutgoing ? 'Outgoing' : 'Incoming'} evidence</span><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]" style={{ color: relationStyle(edge.type).color }}>{String(edge.type || 'related').replace(/_/g, ' ')}</span>{edge.strength !== undefined && <span className="font-mono text-[10px] text-slate-500">strength {Number(edge.strength).toFixed(2)}</span>}</span>
                            {edge.provenance?.length > 0 && <span className="mt-1 block truncate text-[10px] text-slate-500" title={edge.provenance.map((item) => `${item.source} ${item.sourceRecordId || ''}`).join('; ')}>Source: {edge.provenance.map((item) => item.source).filter(Boolean).join(', ')}{edge.provenance[0]?.retrievedAt ? ` · retrieved ${edge.provenance[0].retrievedAt}` : ''}</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
              <Info className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-300">Select an entity to inspect it</p>
              <p className="mt-1 max-w-52 text-xs leading-5">Its metadata and evidence relationships will appear here.</p>
            </div>
          )}
        </aside>
      </div>
      
      {/* Stats Footer */}
      <div className="border-t border-slate-800 bg-[#0b1413] p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <div className="research-graph-stat">
            <div className="text-xl font-bold text-slate-100">{nodes.length}</div>
            <div className="text-[11px] text-slate-500">Entities</div>
          </div>
          <div className="research-graph-stat">
            <div className="text-xl font-bold text-slate-100">{edges.length}</div>
            <div className="text-[11px] text-slate-500">Relationships</div>
          </div>
          <div className="research-graph-stat">
            <div className="text-xl font-bold" style={{ color: ENTITY_STYLES.drug.light }}>{nodes.filter(n => n.type === 'drug').length}</div>
            <div className="text-[11px] text-slate-500">Drugs</div>
          </div>
          <div className="research-graph-stat">
            <div className="text-xl font-bold" style={{ color: ENTITY_STYLES.protein.light }}>{nodes.filter(n => n.type === 'protein').length}</div>
            <div className="text-[11px] text-slate-500">Genes / targets</div>
          </div>
          <div className="research-graph-stat">
            <div className="text-xl font-bold" style={{ color: ENTITY_STYLES.pathway.light }}>{nodes.filter(n => n.type === 'pathway').length}</div>
            <div className="text-[11px] text-slate-500">Pathways</div>
          </div>
          <div className="research-graph-stat">
            <div className="text-xl font-bold" style={{ color: ENTITY_STYLES.disease.light }}>{nodes.filter(n => n.type === 'disease').length}</div>
            <div className="text-[11px] text-slate-500">Diseases</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraphEnhanced;
