import { useState, useEffect } from 'react';
import './SingleBloomNav.css';
import usePluginStore from '../../store/usePluginStore.js';

function SingleBloomNav() {
  const plugins = usePluginStore((state) => state.plugins);
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="single-bloom-container">
      {/* Center dot */}
      <button 
        className={`bloom-center ${isExpanded ? 'expanded' : ''}`}
        onClick={handleToggle}
      >
        <span className="bloom-dot"></span>
      </button>

      {/* Plugin petals */}
      {isExpanded && (
        <div className="bloom-petals">
          {plugins.map((plugin, index) => (
            <button
              key={plugin.id}
              className="bloom-petal"
              style={{ transitionDelay: `${index * 0.04}s` }}
              onClick={() => {
                setActivePlugin(plugin.id);
                setIsExpanded(false);
              }}
            >
              {plugin.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SingleBloomNav;
