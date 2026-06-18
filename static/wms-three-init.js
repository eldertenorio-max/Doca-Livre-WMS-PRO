/**
 * Expõe THREE + OrbitControls no window para wms-mapa-3d.js (Three r160 via ES modules).
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

window.THREE = THREE;
THREE.OrbitControls = OrbitControls;
window.__wmsThreeReady = true;
window.dispatchEvent(new Event('wms-three-ready'));
