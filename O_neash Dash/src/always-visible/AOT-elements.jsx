import SingleBloomNav from './SingleBloomNavigator/SingleBloomNav.jsx';
import usePluginStore from '../store/usePluginStore.js';
import './AOT-elements.css';

function AlwaysOnTop() {
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  const activePlugin = usePluginStore((state) => state.activePlugin);
  return (
    <div className="always-on-top">
      {activePlugin !== null && (
        <button className="always-on-top-home-btn"
          style={{ position: 'absolute', top: 18, left: 18, zIndex: 1000 }}
          onClick={() => setActivePlugin(null)} aria-label="Home"
        > go home... </button>
      )}
      <SingleBloomNav />
      {/* Add more always-on-top UI here in the future */}
    </div>
  );
}

export default AlwaysOnTop;
