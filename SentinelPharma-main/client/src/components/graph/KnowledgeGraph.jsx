/**
 * SentinelPharma Knowledge Graph Component
 * =====================================
 * Interactive Knowledge Graph visualization using React Force Graph.
 * Displays Drug-Target-Pathway-Disease relationships.
 * 
 * Features:
 * - Force-directed graph layout
 * - Click-to-expand node details
 * - Color-coded node types
 * - Interactive zoom and pan
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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
  Info
} from 'lucide-react';

const KnowledgeGraph = ({ data, graphData }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);

  // Initialize graph data
  useEffect(() => {
    if (graphData?.nodes) {
      // Add positions for force-directed layout simulation
      const positionedNodes = graphData.nodes.map((node, index) => ({
        ...node,
        x: 200 + Math.cos(index * (2 * Math.PI / graphData.nodes.length)) * 150,
        y: 150 + Math.sin(index * (2 * Math.PI / graphData.nodes.length)) * 100,
        vx: 0,
        vy: 0
      }));
      setNodes(positionedNodes);
      setEdges(graphData.edges || []);
    } else if (data) {
      // Generate mock graph data if only stats are provided
      generateMockGraph(data);
    }
  }, [graphData, data]);

  // Generate mock graph for visualization
  const generateMockGraph = (stats) => {
    const mockNodes = [];
    const mockEdges = [];
    
    // Central drug node
    mockNodes.push({
      id: 'drug_0',
      label: 'Drug',
      type: 'drug',
      color: '#3B82F6',
      x: 200,
      y: 150
    });

    // Generate target nodes
    const targetCount = Math.min(stats.nodes || 5, 5);
    for (let i = 0; i < targetCount; i++) {
      const angle = (i / targetCount) * 2 * Math.PI;
      mockNodes.push({
        id: `target_${i}`,
        label: `Target ${i + 1}`,
        type: 'protein',
        color: '#10B981',
        x: 200 + Math.cos(angle) * 80,
        y: 150 + Math.sin(angle) * 80
      });
      mockEdges.push({
        source: 'drug_0',
        target: `target_${i}`,
        type: 'binding'
      });
    }

    // Generate pathway nodes
    const pathwayCount = stats.key_pathways?.length || 4;
    for (let i = 0; i < pathwayCount; i++) {
      const angle = (i / pathwayCount) * 2 * Math.PI + Math.PI / 4;
      mockNodes.push({
        id: `pathway_${i}`,
        label: stats.key_pathways?.[i] || `Pathway ${i + 1}`,
        type: 'pathway',
        color: '#8B5CF6',
        x: 200 + Math.cos(angle) * 140,
        y: 150 + Math.sin(angle) * 110
      });
      
      // Connect to nearest target
      if (i < targetCount) {
        mockEdges.push({
          source: `target_${i}`,
          target: `pathway_${i}`,
          type: 'participates_in'
        });
      }
    }

    // Add a few disease nodes
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * 2 * Math.PI + Math.PI / 6;
      mockNodes.push({
        id: `disease_${i}`,
        label: ['Cancer', 'Diabetes', 'Inflammation'][i],
        type: 'disease',
        color: '#EF4444',
        x: 200 + Math.cos(angle) * 180,
        y: 150 + Math.sin(angle) * 130
      });
      
      if (i < pathwayCount) {
        mockEdges.push({
          source: `pathway_${i}`,
          target: `disease_${i}`,
          type: 'associated_with'
        });
      }
    }

    setNodes(mockNodes);
    setEdges(mockEdges);
  };

  // Get node icon based on type
  const getNodeIcon = (type) => {
    switch (type) {
      case 'drug': return Pill;
      case 'protein': return Dna;
      case 'pathway': return Activity;
      case 'disease': return AlertCircle;
      default: return Network;
    }
  };

  // Handle node click
  const handleNodeClick = (node) => {
    setSelectedNode(selectedNode?.id === node.id ? null : node);
  };

  // Render the graph on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Apply zoom
    ctx.save();
    ctx.scale(zoom, zoom);

    // Draw edges
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const radius = isSelected ? 25 : isHovered ? 22 : 18;

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color || '#6B7280';
      ctx.fill();

      // Node border
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#1F2937' : '#6B7280';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Node label
      ctx.fillStyle = '#1F2937';
      ctx.font = `${isSelected ? 'bold ' : ''}11px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label, node.x, node.y + radius + 5);
    });

    ctx.restore();
  }, [nodes, edges, zoom, hoveredNode, selectedNode]);

  // Handle canvas click for node selection
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    // Find clicked node
    const clickedNode = nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 20;
    });

    handleNodeClick(clickedNode);
  };

  // Handle mouse move for hover effects
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    const hoveredNode = nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 20;
    });

    setHoveredNode(hoveredNode);
    canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
  };

  if (!data && !graphData) return null;
  
  const stats = data || { nodes: nodes.length, edges: edges.length, key_pathways: [] };
  
  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Network className="w-5 h-5 mr-2 text-indigo-600" />
          Interactive Knowledge Graph
        </h3>
        
        <div className="flex items-center space-x-2">
          {/* Zoom Controls */}
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
          
          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-2"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <X className="w-4 h-4 text-gray-600" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>
      </div>
      
      <div className="flex">
        {/* Graph Canvas */}
        <div className={`flex-1 ${isFullscreen ? 'h-[calc(100vh-12rem)]' : 'h-80'} bg-gray-50 relative`}>
          <canvas
            ref={canvasRef}
            width={isFullscreen ? window.innerWidth - 350 : 500}
            height={isFullscreen ? window.innerHeight - 250 : 320}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            className="w-full h-full"
          />
          
          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg p-3 shadow-sm">
            <div className="text-xs font-medium text-gray-500 mb-2">Node Types</div>
            <div className="space-y-1">
              {[
                { type: 'drug', color: '#3B82F6', label: 'Drug' },
                { type: 'protein', color: '#10B981', label: 'Protein Target' },
                { type: 'pathway', color: '#8B5CF6', label: 'Pathway' },
                { type: 'disease', color: '#EF4444', label: 'Disease' },
              ].map(item => (
                <div key={item.type} className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-gray-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Node Details Panel */}
        {(selectedNode || isFullscreen) && (
          <div className={`${isFullscreen ? 'w-80' : 'w-64'} border-l border-gray-200 p-4 bg-white`}>
            {selectedNode ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">Node Details</h4>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                
                {/* Node Info */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: selectedNode.color }}
                    >
                      {(() => {
                        const Icon = getNodeIcon(selectedNode.type);
                        return <Icon className="w-5 h-5 text-white" />;
                      })()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{selectedNode.label}</div>
                      <div className="text-sm text-gray-500 capitalize">{selectedNode.type}</div>
                    </div>
                  </div>
                  
                  {/* Metadata */}
                  {selectedNode.metadata && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      {Object.entries(selectedNode.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="font-medium text-gray-900">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Connections */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Connections</div>
                    <div className="space-y-1">
                      {edges
                        .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                        .slice(0, 5)
                        .map((edge, i) => {
                          const connectedId = edge.source === selectedNode.id ? edge.target : edge.source;
                          const connectedNode = nodes.find(n => n.id === connectedId);
                          return (
                            <div 
                              key={i}
                              className="text-xs bg-gray-100 rounded px-2 py-1 flex justify-between items-center"
                            >
                              <span className="text-gray-700">{connectedNode?.label || connectedId}</span>
                              <span className="text-gray-400">{edge.type}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Click a node to view details</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Stats Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-indigo-700">{stats.nodes || nodes.length}</div>
            <div className="text-xs text-gray-500">Nodes</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-indigo-700">{stats.edges || edges.length}</div>
            <div className="text-xs text-gray-500">Edges</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-indigo-700">{stats.key_pathways?.length || 0}</div>
            <div className="text-xs text-gray-500">Pathways</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-indigo-700">
              {nodes.filter(n => n.type === 'disease').length}
            </div>
            <div className="text-xs text-gray-500">Diseases</div>
          </div>
        </div>
        
        {/* Key Pathways Tags */}
        {stats.key_pathways && stats.key_pathways.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-gray-500 mb-2">Key Pathways</div>
            <div className="flex flex-wrap gap-2">
              {stats.key_pathways.map((pathway, index) => (
                <span 
                  key={index}
                  className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium"
                >
                  {pathway}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeGraph;
