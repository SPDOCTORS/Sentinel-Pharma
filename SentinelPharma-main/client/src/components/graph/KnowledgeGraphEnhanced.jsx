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
  Filter,
  Search,
  RefreshCw,
  Eye,
  EyeOff,
  Layers,
  Sparkles,
  Play,
  Pause,
  Route,
  Focus
} from 'lucide-react';

const KnowledgeGraphEnhanced = ({ data, graphData, molecule }) => {
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
  const [pathSelection, setPathSelection] = useState({ from: null, to: null });
  const [pathStatus, setPathStatus] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });

  // Enhanced mock data generator
  const generateEnhancedGraph = useCallback((stats) => {
    const mockNodes = [];
    const mockEdges = [];
    
    // Central drug node
    mockNodes.push({
      id: 'drug_0',
      label: molecule || 'Drug',
      type: 'drug',
      color: '#8B5CF6',
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
        color: '#10B981',
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
        color: '#F59E0B',
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
        color: '#EF4444',
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
        graphData.nodes.map((node) => ({
          ...node,
          depth: typeof node.depth === 'number'
            ? node.depth
            : node.type === 'drug'
              ? 0.55
              : node.type === 'pathway'
                ? 0.7
                : node.type === 'protein'
                  ? 0.45
                  : 0.3
        }))
      );
      setEdges(graphData.edges || []);
    } else {
      const generated = generateEnhancedGraph(data || {});
      setNodes(generated.nodes);
      setEdges(generated.edges);
    }
  }, [graphData, data, generateEnhancedGraph]);

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
  }, [edges]);

  // Filter nodes based on type
  const filteredNodes = useMemo(() => {
    let filtered = nodes;
    
    if (filterType !== 'all') {
      filtered = filtered.filter(n => n.type === filterType);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(n => 
        n.label.toLowerCase().includes(searchTerm.toLowerCase())
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

    // Subtle scanline effect to mimic the holographic display from the reference UI.
    ctx.fillStyle = 'rgba(0, 220, 255, 0.03)';
    for (let y = 0; y < height; y += 8) {
      ctx.fillRect(0, y, width, 1);
    }

    // Draw edges
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (source && target) {
        const sourceProjected = projected.get(source.id);
        const targetProjected = projected.get(target.id);
        if (!sourceProjected || !targetProjected) return;

        const isHighlighted = highlightedPath.includes(edge.source) && highlightedPath.includes(edge.target);
        const avgDepth = (sourceProjected.depth + targetProjected.depth) / 2;
        const baseAlpha = 0.18 + avgDepth * 0.38;
        
        ctx.beginPath();
        ctx.moveTo(sourceProjected.x, sourceProjected.y);
        ctx.lineTo(targetProjected.x, targetProjected.y);
        ctx.strokeStyle = isHighlighted
          ? 'rgba(99, 102, 241, 0.95)'
          : `rgba(56, 189, 248, ${Math.min(0.8, baseAlpha * (edge.strength || 0.6))})`;
        ctx.lineWidth = isHighlighted ? 3.2 : (1.1 + avgDepth) * (edge.weight || 1);
        if (isHighlighted) {
          ctx.shadowColor = 'rgba(129, 140, 248, 0.7)';
          ctx.shadowBlur = 14;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Draw arrow
        if (isHighlighted) {
          const angle = Math.atan2(targetProjected.y - sourceProjected.y, targetProjected.x - sourceProjected.x);
          const arrowSize = 8;
          ctx.fillStyle = '#818CF8';
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

      // Node circle
      ctx.beginPath();
      ctx.arc(projectedNode.x, projectedNode.y, radius, 0, 2 * Math.PI);
      
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
    { id: 'all', label: 'All Nodes', count: nodes.length },
    { id: 'drug', label: 'Drugs', count: nodes.filter(n => n.type === 'drug').length },
    { id: 'protein', label: 'Proteins', count: nodes.filter(n => n.type === 'protein').length },
    { id: 'pathway', label: 'Pathways', count: nodes.filter(n => n.type === 'pathway').length },
    { id: 'disease', label: 'Diseases', count: nodes.filter(n => n.type === 'disease').length }
  ];

  return (
    <div className={`rounded-3xl overflow-hidden border border-cyan-300/30 bg-[#040b14]/95 shadow-[0_18px_70px_rgba(0,0,0,0.45)] ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Header */}
      <div className="p-4 border-b border-cyan-300/20 bg-gradient-to-r from-[#041423] via-[#07263a] to-[#03131f]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_18px_rgba(56,189,248,0.55)]">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-cyan-100">Interactive Knowledge Graph</h3>
              <p className="text-xs text-cyan-100/65">Drug-Target-Pathway-Disease relationships</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="hidden md:flex items-center bg-slate-900/70 border border-cyan-300/20 rounded-xl p-1 mr-2">
              <button
                onClick={() => setViewMode('lab')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'lab' ? 'bg-cyan-500/30 text-cyan-50' : 'text-cyan-100/70 hover:bg-cyan-500/20'}`}
              >
                Lab 3D
              </button>
              <button
                onClick={() => setViewMode('cinematic')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'cinematic' ? 'bg-cyan-500/30 text-cyan-50' : 'text-cyan-100/70 hover:bg-cyan-500/20'}`}
              >
                Cinematic
              </button>
            </div>

            {/* Zoom Controls */}
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-cyan-100/80" />
            </button>
            <span className="text-xs text-cyan-100/70 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.2))}
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4 text-cyan-100/80" />
            </button>
            
            {/* Reset View */}
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors"
              title="Reset View"
            >
              <RefreshCw className="w-4 h-4 text-cyan-100/80" />
            </button>

            <button
              onClick={() => setIsOrbiting((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${isOrbiting ? 'bg-cyan-500/25' : 'hover:bg-cyan-500/20'}`}
              title={isOrbiting ? 'Pause Orbit' : 'Start Orbit'}
            >
              {isOrbiting ? <Pause className="w-4 h-4 text-cyan-100/80" /> : <Play className="w-4 h-4 text-cyan-100/80" />}
            </button>

            <button
              onClick={focusSelectedNode}
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors"
              title="Focus Selected Node"
              disabled={!selectedNode}
            >
              <Focus className={`w-4 h-4 ${selectedNode ? 'text-cyan-100/80' : 'text-cyan-100/35'}`} />
            </button>
            
            {/* Toggle Labels */}
            <button
              onClick={() => setShowLabels(!showLabels)}
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors"
              title={showLabels ? 'Hide Labels' : 'Show Labels'}
            >
              {showLabels ? <Eye className="w-4 h-4 text-cyan-100/80" /> : <EyeOff className="w-4 h-4 text-cyan-100/80" />}
            </button>
            
            {/* Fullscreen */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <X className="w-4 h-4 text-cyan-100/80" /> : <Maximize2 className="w-4 h-4 text-cyan-100/80" />}
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
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors"
              title="Export as Image"
            >
              <Download className="w-4 h-4 text-cyan-100/80" />
            </button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex items-center space-x-2">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-1.5 border border-cyan-300/30 rounded-lg text-sm bg-slate-900/80 text-cyan-100 placeholder-cyan-100/40 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            />
          </div>
          
          {/* Type Filter */}
          <div className="flex items-center space-x-1">
            {nodeTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setFilterType(type.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterType === type.id
                    ? 'bg-cyan-400/25 text-cyan-50 border border-cyan-300/40'
                    : 'bg-slate-900/70 text-cyan-100/75 border border-cyan-300/20 hover:bg-cyan-500/15'
                }`}
              >
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${isPathfinderMode ? 'bg-cyan-500/30 border-cyan-300/45 text-cyan-50' : 'bg-slate-900/70 border-cyan-300/20 text-cyan-100/75 hover:bg-cyan-500/15'}`}
          >
            <span className="inline-flex items-center gap-1">
              <Route className="w-3.5 h-3.5" />
              Pathfinder
            </span>
          </button>
        </div>

        {pathStatus && (
          <div className="mt-2 text-xs text-cyan-100/75 bg-cyan-500/10 border border-cyan-300/20 rounded-lg px-3 py-2">
            {pathStatus}
          </div>
        )}
      </div>
      
      <div className="flex">
        {/* Graph Canvas */}
        <div className={`flex-1 ${isFullscreen ? 'h-[calc(100vh-16rem)]' : 'h-[500px]'} bg-gradient-to-br from-[#01070f] via-[#041826] to-[#08304a] relative`}>
          <div className={`absolute inset-0 pointer-events-none ${viewMode === 'cinematic' ? 'bg-[radial-gradient(circle_at_20%_18%,rgba(56,189,248,0.26),transparent_34%),radial-gradient(circle_at_80%_84%,rgba(45,212,191,0.22),transparent_36%)]' : 'bg-[radial-gradient(circle_at_20%_18%,rgba(56,189,248,0.18),transparent_36%),radial-gradient(circle_at_80%_84%,rgba(45,212,191,0.13),transparent_38%)]'}`} />
          <div className="absolute inset-0 pointer-events-none opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.12) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
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
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />
          
          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-slate-900/88 backdrop-blur rounded-xl p-3 shadow-lg border border-cyan-300/30">
            <div className="text-xs font-semibold text-cyan-100/90 mb-2 flex items-center">
              <Layers className="w-3 h-3 mr-1" />
              Node Types
            </div>
            <div className="space-y-1.5">
              {[
                { type: 'drug', color: '#8B5CF6', label: 'Drug' },
                { type: 'protein', color: '#10B981', label: 'Protein Target' },
                { type: 'pathway', color: '#F59E0B', label: 'Pathway' },
                { type: 'disease', color: '#EF4444', label: 'Disease' },
              ].map(item => (
                <div key={item.type} className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full shadow-sm" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-cyan-100/80">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Instructions */}
          <div className="absolute top-4 left-4 bg-slate-900/85 backdrop-blur rounded-lg p-2 shadow-sm border border-cyan-300/25">
            <div className="text-xs text-cyan-100/70 space-y-1">
              <div>Click + drag to pan</div>
              <div>Mouse wheel to zoom</div>
              <div>Click node for insight panel</div>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 bg-slate-950/88 backdrop-blur rounded-xl p-2.5 shadow-lg border border-cyan-300/25">
            <div className="text-[10px] text-cyan-100/70 mb-1.5 flex items-center gap-1">
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
        <div className={`${isFullscreen ? 'w-96' : 'w-80'} border-l border-cyan-300/20 bg-[#020d18]/92 overflow-y-auto`}>
          {selectedNode ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-cyan-100">Node Details</h4>
                <button
                  onClick={() => {
                    setSelectedNode(null);
                    setHighlightedPath([]);
                  }}
                  className="p-1 hover:bg-cyan-500/20 rounded"
                >
                  <X className="w-4 h-4 text-cyan-100/70" />
                </button>
              </div>
              
              {/* Node Info */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: selectedNode.color }}
                  >
                    {(() => {
                      const Icon = getNodeIcon(selectedNode.type);
                      return <Icon className="w-6 h-6 text-white" />;
                    })()}
                  </div>
                  <div>
                    <div className="font-semibold text-cyan-100">{selectedNode.label}</div>
                    <div className="text-sm text-cyan-100/60 capitalize">{selectedNode.type}</div>
                  </div>
                </div>
                
                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/80 border border-cyan-300/20 rounded-lg p-3">
                    <div className="text-xs text-cyan-100/60">Connections</div>
                    <div className="text-xl font-bold text-cyan-100">{selectedNode.connections}</div>
                  </div>
                  <div className="bg-slate-900/80 border border-cyan-300/20 rounded-lg p-3">
                    <div className="text-xs text-cyan-100/60">Size</div>
                    <div className="text-xl font-bold text-cyan-100">{selectedNode.size || 18}</div>
                  </div>
                </div>
                
                {/* Metadata */}
                {selectedNode.metadata && (
                  <div className="bg-slate-900/80 border border-cyan-300/20 rounded-lg p-3">
                    <div className="text-xs font-semibold text-cyan-100/85 mb-2">Metadata</div>
                    <div className="space-y-1.5">
                      {Object.entries(selectedNode.metadata).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[1fr_auto] gap-3 items-start text-sm border-b border-cyan-300/10 pb-1.5">
                          <span className="text-cyan-100/60 capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="font-medium text-cyan-50 text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Connected Nodes */}
                <div>
                  <div className="text-sm font-semibold text-cyan-100/90 mb-2">Connected Nodes</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {edges
                      .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                      .map((edge, i) => {
                        const connectedId = edge.source === selectedNode.id ? edge.target : edge.source;
                        const connectedNode = nodes.find(n => n.id === connectedId);
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedNode(connectedNode)}
                            className="w-full text-left text-xs bg-slate-900/70 border border-cyan-300/20 hover:bg-cyan-500/15 rounded px-2 py-1.5 flex justify-between items-center transition-colors"
                          >
                            <span className="font-medium text-cyan-100/90">{connectedNode?.label || connectedId}</span>
                            <span className="text-cyan-100/45 text-xs">{edge.type}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-cyan-100/60">
              <Info className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Click a node to view details</p>
              <p className="text-xs mt-1">Connections will be highlighted</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Stats Footer */}
      <div className="p-4 border-t border-cyan-300/20 bg-slate-950/75">
        <div className="grid grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-200">{nodes.length}</div>
            <div className="text-xs text-cyan-100/60">Total Nodes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-200">{edges.length}</div>
            <div className="text-xs text-cyan-100/60">Connections</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-200">{nodes.filter(n => n.type === 'pathway').length}</div>
            <div className="text-xs text-cyan-100/60">Pathways</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-200">{nodes.filter(n => n.type === 'protein').length}</div>
            <div className="text-xs text-cyan-100/60">Targets</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-200">{nodes.filter(n => n.type === 'disease').length}</div>
            <div className="text-xs text-cyan-100/60">Diseases</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraphEnhanced;
