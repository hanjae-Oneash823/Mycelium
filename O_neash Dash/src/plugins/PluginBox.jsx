import { motion, AnimatePresence } from 'framer-motion';
import HomePage from '../home/HomePage.jsx';
import usePluginStore from '../store/usePluginStore.js';


function PluginBox() {
  const plugins = usePluginStore((state) => state.plugins);
  const activePlugin = usePluginStore((state) => state.activePlugin);
  const selectedPlugin = plugins.find(p => p.id === activePlugin);
  const ComponentToRender = selectedPlugin?.component || HomePage;

  return (
    <div className="plugin-box relative h-full w-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={activePlugin || 'home'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="h-full w-full"
        >
          <ComponentToRender />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default PluginBox;
