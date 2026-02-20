import { useEffect, useRef, useState } from 'react';

/**
 * ForceGraph - Renders a force-directed graph of notes and tags
 */
function ForceGraph({ notes, focusedNodeId, highlightedNodes = [] }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const cameraOffsetRef = useRef({ x: 0, y: 0 });
  const simulationRunningRef = useRef(false);

  // Parse tags from note content
  const extractTags = (content) => {
    const tagRegex = /#(\w+)/g;
    const tags = [];
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      tags.push(match[1]);
    }
    return [...new Set(tags)]; // Remove duplicates
  };

  // Render the graph
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    ctx.translate(cameraOffsetRef.current.x, cameraOffsetRef.current.y);

    // Draw links
    ctx.lineWidth = 1;
    linksRef.current.forEach(link => {
      const source = nodesRef.current.find(n => n.id === link.source);
      const target = nodesRef.current.find(n => n.id === link.target);
      
      if (source && target) {
        ctx.strokeStyle = link.type === 'chronological' 
          ? 'rgba(255, 255, 255, 0.15)' 
          : 'rgba(100, 200, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    nodesRef.current.forEach(node => {
      const isHovered = hoveredNode?.id === node.id;
      const isFocused = focusedNodeId === node.id;
      const isHighlighted = highlightedNodes.includes(node.id);
      const isDimmed = highlightedNodes.length > 0 && !isHighlighted && node.type === 'note';
      const radius = node.type === 'tag' ? 6 : 8;
      
      // Glow effect
      if (isHovered || isFocused) {
        ctx.shadowBlur = isFocused ? 30 : 20;
        ctx.shadowColor = node.type === 'tag' ? '#64c8ff' : '#ffffff';
      } else if (!isDimmed) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = node.type === 'tag' ? '#64c8ff' : '#ffffff';
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = isDimmed ? 'rgba(255, 255, 255, 0.2)' : (node.type === 'tag' ? '#64c8ff' : '#ffffff');
      ctx.beginPath();
      ctx.arc(node.x, node.y, isFocused ? radius + 2 : radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      
      // Draw text label
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillStyle = isDimmed ? 'rgba(255, 255, 255, 0.2)' : (node.type === 'tag' ? '#64c8ff' : 'rgba(255, 255, 255, 0.8)');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      const textX = node.x + radius + 5;
      const textY = node.y;
      
      // Truncate long titles
      let displayText = node.title;
      if (displayText.length > 15) {
        displayText = displayText.substring(0, 15) + '...';
      }
      
      ctx.fillText(displayText, textX, textY);
    });
    
    ctx.restore();
  };

  // Run physics simulation to settle nodes
  const runPhysicsSimulation = () => {
    if (simulationRunningRef.current) return;
    simulationRunningRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxIterations = 300;
    let iteration = 0;

    const simulate = () => {
      // Apply forces
      nodesRef.current.forEach(node => {
        // Center force
        const dx = centerX - node.x;
        const dy = centerY - node.y;
        node.vx += dx * 0.0005;
        node.vy += dy * 0.0005;

        // Damping
        node.vx *= 0.92;
        node.vy *= 0.92;
      });

      // Link forces
      linksRef.current.forEach(link => {
        const source = nodesRef.current.find(n => n.id === link.source);
        const target = nodesRef.current.find(n => n.id === link.target);
        
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDistance = link.type === 'chronological' ? 50 : 40;
          const force = (distance - targetDistance) * 0.05;
          
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          
          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        }
      });

      // Repulsion between nodes
      for (let i = 0; i < nodesRef.current.length; i++) {
        for (let j = i + 1; j < nodesRef.current.length; j++) {
          const nodeA = nodesRef.current[i];
          const nodeB = nodesRef.current[j];
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const repulsion = 300 / (distance * distance);
          
          const fx = (dx / distance) * repulsion;
          const fy = (dy / distance) * repulsion;
          
          nodeA.vx -= fx;
          nodeA.vy -= fy;
          nodeB.vx += fx;
          nodeB.vy += fy;
        }
      }

      // Update positions
      nodesRef.current.forEach(node => {
        node.x += node.vx;
        node.y += node.vy;
      });

      render();

      iteration++;
      if (iteration < maxIterations) {
        requestAnimationFrame(simulate);
      } else {
        simulationRunningRef.current = false;
      }
    };

    simulate();
  };

  // Build graph data structure and run simulation when notes change
  useEffect(() => {
    if (!notes.length) {
      nodesRef.current = [];
      linksRef.current = [];
      render();
      return;
    }

    const newNodes = [];
    const newLinks = [];
    const tagNodeMap = new Map();

    // Sort notes by creation time
    const sortedNotes = [...notes].sort((a, b) => a.createdAt - b.createdAt);

    // Create note nodes
    sortedNotes.forEach((note, index) => {
      newNodes.push({
        id: note.id,
        title: note.title,
        type: 'note',
        x: Math.random() * 150 + 120,
        y: Math.random() * 150 + 120,
        vx: 0,
        vy: 0
      });

      // Connect to previous note (chronological chain)
      if (index > 0) {
        newLinks.push({
          source: sortedNotes[index - 1].id,
          target: note.id,
          type: 'chronological'
        });
      }

      // Extract and create tag nodes
      const tags = extractTags(note.content || '');
      tags.forEach(tag => {
        if (!tagNodeMap.has(tag)) {
          const tagNodeId = `tag-${tag}`;
          tagNodeMap.set(tag, tagNodeId);
          newNodes.push({
            id: tagNodeId,
            title: `#${tag}`,
            type: 'tag',
            x: Math.random() * 150 + 120,
            y: Math.random() * 150 + 120,
            vx: 0,
            vy: 0
          });
        }

        // Link note to tag
        newLinks.push({
          source: note.id,
          target: tagNodeMap.get(tag),
          type: 'tag'
        });
      });
    });

    nodesRef.current = newNodes;
    linksRef.current = newLinks;
    
    // Run physics simulation to settle nodes
    runPhysicsSimulation();
  }, [notes]);

  // Smooth camera movement when focusing on a node
  useEffect(() => {
    if (focusedNodeId) {
      const focusedNode = nodesRef.current.find(n => n.id === focusedNodeId);
      if (focusedNode) {
        const canvas = canvasRef.current;
        if (canvas) {
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          
          const targetX = centerX - focusedNode.x;
          const targetY = centerY - focusedNode.y;
          
          // Smooth transition
          const startX = cameraOffsetRef.current.x;
          const startY = cameraOffsetRef.current.y;
          const startTime = Date.now();
          const duration = 500;
          
          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            cameraOffsetRef.current = {
              x: startX + (targetX - startX) * easeProgress,
              y: startY + (targetY - startY) * easeProgress
            };
            
            render();
            
            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };
          
          animate();
        }
      }
    } else {
      // Return to center
      const startX = cameraOffsetRef.current.x;
      const startY = cameraOffsetRef.current.y;
      const startTime = Date.now();
      const duration = 500;
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        cameraOffsetRef.current = {
          x: startX - startX * easeProgress,
          y: startY - startY * easeProgress
        };
        
        render();
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      animate();
    }
  }, [focusedNodeId]);

  // Re-render when hover or highlight changes
  useEffect(() => {
    render();
  }, [hoveredNode, focusedNodeId, highlightedNodes]);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - cameraOffsetRef.current.x;
    const y = e.clientY - rect.top - cameraOffsetRef.current.y;

    // Check if hovering over any node
    const hovered = nodesRef.current.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = node.type === 'tag' ? 6 : 8;
      return distance <= radius + 5;
    });

    setHoveredNode(hovered || null);
    canvas.style.cursor = hovered ? 'pointer' : 'default';
  };

  return (
    <div className="force-graph">
      <canvas
        ref={canvasRef}
        width={390}
        height={390}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredNode(null)}
      />
    </div>
  );
}

export default ForceGraph;
