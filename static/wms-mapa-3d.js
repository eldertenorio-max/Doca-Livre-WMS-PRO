/**
 * Visualização 3D do layout WMS — Three.js r128 (script global).
 */
(function (global) {
    'use strict';

    var SLOT_W = 1.22;
    var SLOT_H = 0.95;
    var SLOT_D = 1.15;
    var GAP_POS = 0.92;
    var GAP_CAM_ADJ = 0.58;
    var CAM_FLOOR_PAD = 0.28;
    var NAV_ARROW_FLOOR_Y = 0.045;
    var NAV_ARROW_LIFT = 0.018;
    var WALL_RACK_GAP = 0.14;
    var WALL_OUTSET = 0.10;
    var RACK_HALF_DEPTH = SLOT_D * 0.54;
    var MAIN_AISLE_W = 12;
    var MAX_NIV = 5;
    var AISLE_W = 6.8;
    var LEVEL_H = 1.42;
    var UPR_W = 0.13;
    var UPR_D = 0.13;
    var BEAM_H = 0.12;
    var BEAM_FACE = 0.16;
    var SHELF_TH = 0.075;

    var COL_BLUE = 0x1158b4;
    var COL_BLUE_DARK = 0x0a2e72;
    var COL_ORANGE = 0xee6800;
    var COL_DECK = 0xc47f38;
    var COL_DECK_METAL = 0x8fa3b0;
    var COL_FLOOR = 0xcdd2d8;
    var COL_CORRIDOR = 0x555e66;
    var COL_CORRIDOR_EDGE = 0xf0f2f4;
    var COL_CORRIDOR_STRIPE = 0xffd54f;
    var COL_WALL_DIV = 0xcdd5de;
    var COL_WALL_FRAME = 0x4a6272;
    var WALL_DIV_TH = 0.34;

    var LEGENDA = [
        { key: 'vazia', label: 'Vazia (pulmão)', color: '#ffffff' },
        { key: 'picking_vazia', label: 'Vazia (picking nív.1)', color: '#e3f2fd' },
        { key: 'ocupada', label: 'Ocupada', color: '#ef5350' },
        { key: 'envio_mg', label: 'ENVIO P/ MINAS', color: '#42a5f5' },
        { key: 'retrabalho', label: 'RETRABALHO', color: '#ffca28' },
        { key: 'descarte_perdas', label: 'DESCARTE', color: '#8d6e63' },
        { key: 'palete_bloqueado', label: 'BLOQUEADOS', color: '#78909c' },
        { key: 'avaria', label: 'AVARIA', color: '#ab47bc' },
        { key: 'reentregas', label: 'REENTREGAS', color: '#7e57c2' }
    ];

    var state = {
        prefix: 'wms-mapa3d',
        inited: false,
        scene: null,
        camera: null,
        renderer: null,
        controls: null,
        rackGroup: null,
        animId: null,
        raycaster: null,
        mouse: null,
        pickables: [],
        defaultCamPos: null,
        defaultTarget: null,
        wireframe: false,
        resizeObs: null,
        slotIndex: [],
        camGroups: {},
        camFilter: null,
        _studioGroup: null,
        _interiorLightGroup: null,
        _sceneLights: null,
        _camIntroId: null,
        _canvas: null,
        interiorMode: false,
        layoutMeta: null,
        _navGroup: null,
        _navAnimId: null,
        _highlightPrev: null,
        _onPointerMove: null,
        _onClick: null,
        _onWindowResize: null
    };

    var CAM_ORDER = [11, 12, 13, 21];

    function T() {
        if (!global.THREE) throw new Error('Three.js não carregou');
        return global.THREE;
    }

    function ensureThree() {
        return new Promise(function (resolve, reject) {
            if (global.THREE && global.THREE.OrbitControls) return resolve();
            var deadline = Date.now() + 20000;
            (function tick() {
                if (global.THREE && global.THREE.OrbitControls) return resolve();
                if (Date.now() > deadline) {
                    return reject(new Error('Three.js não disponível. Verifique a conexão com a internet e recarregue a página.'));
                }
                setTimeout(tick, 50);
            })();
        });
    }

    function $(part) {
        return document.getElementById(state.prefix + '-' + part);
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function hex(c) {
        return parseInt(String(c).replace('#', ''), 16);
    }

    function _maxNivCam(cod) {
        return parseInt(cod, 10) === 21 ? 2 : MAX_NIV;
    }

    function _levelHForCam(cod) {
        /* câmaras com poucos níveis ganham nível mais alto (armazenamento a granel) */
        var mn = _maxNivCam(cod);
        return mn <= 2 ? LEVEL_H * 2.1 : LEVEL_H;
    }

    function _camMeta(cod) {
        cod = parseInt(cod, 10);
        if (cod === 21) return { tipo: 'Refrigerado', temp: '-18' };
        return { tipo: 'Congelado', temp: '-20' };
    }

    function _sortCamaras(camaras) {
        return (camaras || []).slice().sort(function (a, b) {
            var ia = CAM_ORDER.indexOf(parseInt(a.codigo, 10));
            var ib = CAM_ORDER.indexOf(parseInt(b.codigo, 10));
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
    }

    function _pad2(n) {
        return String(parseInt(n, 10)).padStart(2, '0');
    }

    function _barcodeLongarina(cam, pos, niv) {
        return parseInt(cam, 10) + '.' + parseInt(pos, 10) + '.' + parseInt(niv, 10);
    }

    function _formatEnderecoNav(slotInfo) {
        if (!slotInfo) return { titulo: '', subtitulo: '' };
        var cam = parseInt(slotInfo.camCod, 10);
        var rua = String(slotInfo.rua || '').trim().toUpperCase();
        var pos = parseInt(slotInfo.posicao, 10);
        var niv = parseInt(slotInfo.nivel, 10) || 1;
        return {
            titulo: _pad2(cam) + '-' + rua + '-' + _pad2(pos) + '-' + niv,
            subtitulo: 'Câmara ' + cam + '  ·  Rua ' + rua + '  ·  Col ' + _pad2(pos) + '  ·  Nív ' + niv
        };
    }

    function _makeNavAddrLabel(THREE, slotInfo) {
        var lbl = _formatEnderecoNav(slotInfo);
        if (!lbl.titulo) return null;
        var canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 320;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(183,28,28,0.92)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 4;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 72px Arial,sans-serif';
        ctx.fillText(lbl.titulo, canvas.width / 2, canvas.height * 0.36);
        ctx.font = '500 40px Arial,sans-serif';
        ctx.fillText(lbl.subtitulo, canvas.width / 2, canvas.height * 0.72);
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        var mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: false
        });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.52), mat);
        mesh.renderOrder = 5;
        mesh.visible = false;
        return mesh;
    }

    function _navLabelFaceCamera(label, labelPos, camPos) {
        if (!label || !labelPos || !camPos) return;
        label.position.copy(labelPos);
        label.lookAt(camPos.x, camPos.y, camPos.z);
    }

    function _makeNavArrowMesh(THREE) {
        var shape = new THREE.Shape();
        shape.moveTo(0, -0.58);
        shape.lineTo(0.36, -0.02);
        shape.lineTo(0.14, -0.02);
        shape.lineTo(0.14, 0.52);
        shape.lineTo(-0.14, 0.52);
        shape.lineTo(-0.14, -0.02);
        shape.lineTo(-0.36, -0.02);
        shape.closePath();
        var geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        geo.computeBoundingBox();
        geo.translate(0, -geo.boundingBox.min.y + NAV_ARROW_LIFT, -geo.boundingBox.min.z);
        var mat = new THREE.MeshPhongMaterial({
            color: 0xff1744,
            emissive: 0x660000,
            shininess: 40,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(1.15, 1.15, 1.15);
        mesh.renderOrder = 4;
        return mesh;
    }

    function _navArrowFloorY() {
        return NAV_ARROW_FLOOR_Y;
    }

    function _orientNavArrow(arrow, x, z, dirX, dirZ) {
        arrow.position.set(x, _navArrowFloorY(), z);
        var len = Math.hypot(dirX, dirZ);
        if (len < 0.0005) return;
        arrow.rotation.set(0, Math.atan2(dirX, dirZ), 0);
    }

    function _orientNavArrowToward(arrow, x, y, z, tx, ty, tz) {
        arrow.position.set(x, y != null ? y : _navArrowFloorY(), z);
        var dx = tx - x;
        var dz = tz - z;
        var len = Math.hypot(dx, dz);
        if (len < 0.0005) {
            dx = 0;
            dz = -1;
        }
        arrow.rotation.set(0, Math.atan2(dx, dz), 0);
    }

    function _smoothNavStep(u) {
        return u * u * (3 - 2 * u);
    }

    function _animateCameraTo(fromPos, fromTgt, toPos, toTgt, duration, onDone) {
        var t0 = null;
        function step(ts) {
            if (!state.camera || !state.controls) return;
            if (!t0) t0 = ts;
            var u = Math.min((ts - t0) / duration, 1);
            u = _smoothNavStep(u);
            state.camera.position.lerpVectors(fromPos, toPos, u);
            state.controls.target.lerpVectors(fromTgt, toTgt, u);
            state.controls.update();
            renderFrame();
            if (u < 1) {
                state._navAnimId = requestAnimationFrame(step);
            } else {
                state._navAnimId = null;
                if (onDone) onDone();
            }
        }
        state._navAnimId = requestAnimationFrame(step);
    }

    function _beamLipAisleX(xF, xB, towardAisle) {
        var cx = (xF + xB) / 2;
        var w = Math.abs(xF - xB) + UPR_W;
        var lipOff = towardAisle > 0 ? w * 0.18 : -w * 0.18;
        var lipHalf = w * 0.26;
        return towardAisle > 0 ? cx + lipOff + lipHalf + 0.004 : cx + lipOff - lipHalf - 0.004;
    }

    function _beamLipY(niv, levelH) {
        var lh = levelH || LEVEL_H;
        var yBeam = (niv - 1) * lh + BEAM_H * 0.5;
        return yBeam + BEAM_H * 0.18;
    }

    function _addLongarinaEtqOnBeam(THREE, parent, camCod, pos, niv, maxNiv, xFace, y, z, towardAisle, labelW) {
        var bc = _barcodeLongarina(camCod, pos, niv);
        var planeH = BEAM_H * 0.34;
        var planeW = labelW || Math.min(SLOT_D * 0.76, 0.32);
        var canvas = document.createElement('canvas');
        canvas.width = 280;
        canvas.height = 72;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255,255,255,0.97)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
        ctx.fillStyle = '#1a237e';
        ctx.font = 'bold 28px Arial,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bc, canvas.width / 2 - (maxNiv > 1 ? 8 : 0), canvas.height / 2);
        if (maxNiv > 1 && niv === 1) {
            ctx.fillStyle = '#1565c0';
            ctx.font = 'bold 22px Arial,sans-serif';
            ctx.fillText('▼', canvas.width - 24, canvas.height / 2 + 1);
        } else if (maxNiv > 1 && niv === maxNiv) {
            ctx.fillStyle = '#1565c0';
            ctx.font = 'bold 22px Arial,sans-serif';
            ctx.fillText('▲', canvas.width - 24, canvas.height / 2 + 1);
        }
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        var mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
        mesh.position.set(xFace, y + 0.002, z);
        mesh.rotation.y = towardAisle > 0 ? -Math.PI / 2 : Math.PI / 2;
        mesh.renderOrder = 2;
        mesh.userData = { isLongarinaLabel: true, posicao: pos, nivel: niv, camara: camCod };
        parent.add(mesh);
    }

    function _addLongarinaLabelsRack(THREE, parent, camCod, rua, maxPos, maxNiv, xF, xB, towardAisle, bayStep, levelH) {
        var lh = levelH || LEVEL_H;
        var xFace = _beamLipAisleX(xF, xB, towardAisle);
        var labelW = Math.min(SLOT_D * 0.82, bayStep * 0.9);
        for (var pos = 1; pos <= maxPos; pos++) {
            var z = (pos - 1) * bayStep + SLOT_D / 2;
            for (var niv = 1; niv <= maxNiv; niv++) {
                _addLongarinaEtqOnBeam(THREE, parent, camCod, pos, niv, maxNiv, xFace, _beamLipY(niv, lh), z, towardAisle, labelW);
            }
        }
        var ruaLbl = _textPlane(THREE, 'Rua ' + String(rua || '').trim().toUpperCase(), 0.5, 0.12, 24, '#fff', null);
        ruaLbl.position.set(xFace, _beamLipY(1, lh) + BEAM_H * 0.55, SLOT_D * 0.35);
        ruaLbl.rotation.y = towardAisle > 0 ? -Math.PI / 2 : Math.PI / 2;
        ruaLbl.renderOrder = 2;
        parent.add(ruaLbl);
    }

    function _textPlane(THREE, text, planeW, planeH, fontPx, color, bg) {
        var canvas = document.createElement('canvas');
        var str = String(text);
        var cw = str.length > 24 ? 1024 : 512;
        canvas.width = cw;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        if (bg) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = color || '#212121';
        var px = fontPx;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + px + 'px Arial,sans-serif';
        while (px > 16 && ctx.measureText(str).width > cw * 0.9) {
            px -= 2;
            ctx.font = 'bold ' + px + 'px Arial,sans-serif';
        }
        ctx.fillText(str, canvas.width / 2, canvas.height / 2);
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        var mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        return new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
    }

    function _textPlaneMultiline(THREE, lines, planeW, planeH, fontPx, color, bg) {
        var canvas = document.createElement('canvas');
        var rows = (lines || []).filter(function (l) { return l; });
        canvas.width = 1024;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        if (bg) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var px = fontPx;
        var maxW = 0;
        rows.forEach(function (line) {
            ctx.font = 'bold ' + px + 'px Arial,sans-serif';
            maxW = Math.max(maxW, ctx.measureText(line).width);
        });
        while (px > 14 && maxW > canvas.width * 0.88) {
            px -= 2;
            maxW = 0;
            rows.forEach(function (line) {
                ctx.font = 'bold ' + px + 'px Arial,sans-serif';
                maxW = Math.max(maxW, ctx.measureText(line).width);
            });
        }
        var step = canvas.height / (rows.length + 1);
        rows.forEach(function (line, i) {
            ctx.font = (i === 0 ? 'bold ' : '') + px + 'px Arial,sans-serif';
            ctx.fillText(line, canvas.width / 2, step * (i + 1));
        });
        var tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        var mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        return new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
    }

    function _addCorridorSignage(THREE, camGroup, aisleLen, cod) {
        var meta = _camMeta(cod);
        var midZ = aisleLen * 0.42;
        var lblMeta = _textPlane(THREE, 'CÂMARA FRIA', 2.2, 0.35, 52, '#212121');
        lblMeta.position.set(0, 3.8, midZ - 1.2);
        camGroup.add(lblMeta);
        var num = _textPlane(THREE, String(cod), 1.8, 1.4, 160, '#c62828');
        num.position.set(0, 2.5, midZ);
        camGroup.add(num);
        var tipo = _textPlane(THREE, meta.tipo, 0.35, 1.6, 48, '#1565c0');
        tipo.position.set(-0.55, 1.5, midZ + 0.5);
        tipo.rotation.y = Math.PI / 2;
        camGroup.add(tipo);
        _addBox(THREE, camGroup, AISLE_W * 0.42, 0.06, 0.28, 0, 0.03, 0.18, new THREE.MeshPhongMaterial({ color: 0xffeb3b }));
        var floorNum = _textPlane(THREE, String(cod), 1.1, 0.85, 120, '#c62828', 'rgba(255,255,255,0.92)');
        floorNum.rotation.x = -Math.PI / 2;
        floorNum.position.set(0, 0.018, 0.55);
        camGroup.add(floorNum);
    }

    function _applyCamFilter(intro) {
        var filter = state.camFilter;
        Object.keys(state.camGroups).forEach(function (cod) {
            var g = state.camGroups[cod];
            if (g) g.visible = !filter || parseInt(cod, 10) === filter;
        });
        centerCameraOnRack(!!intro, !!filter);
    }

    function _setPerimeterWallsVisible(visible) {
        if (!state.rackGroup) return;
        state.rackGroup.traverse(function (obj) {
            if (obj.isGroup && obj.name === 'paredes-perimetro') {
                obj.visible = visible;
            }
        });
    }

    function _setExplorationControls(interior, camCod) {
        if (!state.controls) return;
        if (interior) {
            state.controls.minDistance = 0.25;
            state.controls.maxDistance = 52;
            state.controls.maxPolarAngle = Math.PI * 0.88;
            state.controls.minPolarAngle = 0.08;
            state.controls.enablePan = true;
            state.controls.dampingFactor = 0.06;
            if (state.scene && state.scene.fog) {
                state.scene.fog.near = 16;
                state.scene.fog.far = 105;
            }
            if (state.camera) {
                state.camera.fov = 72;
                state.camera.near = 0.05;
                state.camera.updateProjectionMatrix();
            }
            _setPerimeterWallsVisible(false);
        } else {
            state.controls.minDistance = 1.1;
            state.controls.maxDistance = 220;
            state.controls.maxPolarAngle = Math.PI / 2.05;
            state.controls.minPolarAngle = 0;
            state.controls.dampingFactor = 0.08;
            if (state.scene && state.scene.fog) {
                state.scene.fog.near = 55;
                state.scene.fog.far = 320;
            }
            if (state.camera) {
                state.camera.fov = 48;
                state.camera.near = 0.1;
                state.camera.updateProjectionMatrix();
            }
            _setPerimeterWallsVisible(true);
        }
        _setInteriorVisuals(!!interior, camCod || state.camFilter);
    }

    function _clearInteriorLights() {
        if (state._interiorLightGroup && state.scene) {
            state.scene.remove(state._interiorLightGroup);
            state._interiorLightGroup.traverse(function (ch) {
                if (ch.isLight && ch.dispose) ch.dispose();
            });
        }
        state._interiorLightGroup = null;
    }

    function _setInteriorVisuals(active, camCod) {
        var THREE = T();
        var bgExt = 0xf4f6f8;
        var bgInt = 0xe3eaf2;
        if (state.scene) {
            state.scene.background.setHex(active ? bgInt : bgExt);
            if (state.scene.fog) state.scene.fog.color.setHex(active ? bgInt : bgExt);
        }
        if (state._studioGroup) state._studioGroup.visible = !active;
        if (state._sceneLights) {
            var L = state._sceneLights;
            L.ambient.intensity = active ? 0.68 : 0.58;
            L.hemi.intensity = active ? 0.5 : 0.45;
            L.dir.intensity = active ? 0.58 : 0.92;
            L.fill.intensity = active ? 0.48 : 0.35;
            L.rim.intensity = active ? 0.18 : 0.22;
        }
        if (state._sceneLights && !active) {
            state._sceneLights.dir.position.set(28, 42, 22);
            state._sceneLights.fill.position.set(-24, 22, -16);
        }
        _clearInteriorLights();
        if (!active || !state.scene || !camCod) return;
        var interior = _interiorCameraPos(camCod);
        if (!interior) return;
        var cx = interior.target.x;
        var cz = interior.target.z;
        var group = new THREE.Group();
        group.name = 'interior-lights';
        var ceil = new THREE.PointLight(0xffffff, 0.62, 32);
        ceil.position.set(cx, 4.1, cz - 2.5);
        group.add(ceil);
        var mid = new THREE.PointLight(0xe8f4ff, 0.45, 26);
        mid.position.set(cx, 3.4, cz + 1.5);
        group.add(mid);
        var floorFill = new THREE.PointLight(0xdde8f5, 0.28, 18);
        floorFill.position.set(cx, 0.9, interior.pos.z + 1.2);
        group.add(floorFill);
        state.scene.add(group);
        state._interiorLightGroup = group;
        if (state._sceneLights) {
            state._sceneLights.dir.position.set(cx + 3.5, 6.5, interior.pos.z - 1.5);
            state._sceneLights.fill.position.set(cx - 4, 3.2, interior.pos.z + 2);
        }
    }

    function _interiorCameraPos(camCod) {
        var THREE = T();
        var meta = state.layoutMeta || {};
        var camPos = meta.positions[camCod];
        if (!camPos) return null;
        var g = state.camGroups[String(camCod)];
        if (!g || !g.visible) return null;
        var box = _boxFromRackGroup(g);
        if (box.isEmpty()) return null;
        var size = box.getSize(new THREE.Vector3());
        var center = box.getCenter(new THREE.Vector3());
        var eyeY = 1.74;
        var lookY = 1.35;
        var entryZ = camPos.z + Math.max(size.z * 0.35, 2.0);
        var deepZ = camPos.z + Math.max(size.z * 0.82, size.z - 1.2);
        return {
            pos: new THREE.Vector3(center.x, eyeY, entryZ),
            target: new THREE.Vector3(center.x, lookY, deepZ)
        };
    }

    function enterChamberView(camCod) {
        if (!state.camera || !state.controls || !state.rackGroup) return;
        camCod = parseInt(camCod || state.camFilter, 10);
        if (!camCod || !state.camGroups[String(camCod)]) return;
        if (state.camFilter !== camCod) {
            state.camFilter = camCod;
            Object.keys(state.camGroups).forEach(function (cod) {
                var grp = state.camGroups[cod];
                if (grp) grp.visible = parseInt(cod, 10) === camCod;
            });
        }
        var interior = _interiorCameraPos(camCod);
        if (!interior) return;
        _cancelCamIntro();
        _clearNavigation();
        state.interiorMode = true;
        _setExplorationControls(true, camCod);
        var fromPos = state.camera.position.clone();
        var fromTgt = state.controls.target.clone();
        _animateCameraTo(fromPos, fromTgt, interior.pos, interior.target, 980, function () {
            state.defaultCamPos = interior.pos.clone();
            state.defaultTarget = interior.target.clone();
            renderFrame();
        });
    }

    function _pickCamaraCodAt(ev) {
        var wrap = $('wrap');
        if (!wrap || !state.raycaster || !state.camera || !state.rackGroup) return null;
        var rect = wrap.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        state.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        var hits = state.raycaster.intersectObject(state.rackGroup, true);
        for (var i = 0; i < hits.length; i++) {
            var obj = hits[i].object;
            while (obj) {
                if (obj.name && /^camara-\d+$/.test(obj.name)) {
                    return parseInt(obj.name.replace('camara-', ''), 10);
                }
                obj = obj.parent;
            }
        }
        return null;
    }

    function setCamaraFilter(cod) {
        state.camFilter = cod ? parseInt(cod, 10) : null;
        if (!state.rackGroup || !Object.keys(state.camGroups).length) return;
        _applyCamFilter(true);
    }

    function slotColor(slot) {
        var dest = (slot.destino_acao || '').toLowerCase();
        if (dest === 'envio_mg') return hex('#42a5f5');
        if (dest === 'retrabalho') return hex('#ffca28');
        if (dest === 'descarte_perdas') return hex('#8d6e63');
        if (dest === 'palete_bloqueado') return hex('#78909c');
        if (dest === 'avaria') return hex('#ab47bc');
        if (dest === 'reentregas') return hex('#7e57c2');
        if ((slot.status || '') === 'ocupada') {
            var cat = (slot.categoria_zona || '').toUpperCase();
            if (cat === 'A') return hex('#e53935');
            if (cat === 'B') return hex('#fb8c00');
            if (cat === 'C') return hex('#fdd835');
            if (cat === 'D') return hex('#8e24aa');
            return hex('#ef5350');
        }
        if (parseInt(slot.nivel, 10) === 1) return hex('#90caf9');
        return hex('#0d47a1');
    }

    function renderLegenda() {
        var el = $('legenda');
        if (!el) return;
        el.innerHTML = LEGENDA.map(function (it) {
            return '<span class="wms-mapa3d-legenda-item"><span class="wms-mapa3d-legenda-swatch" style="background:' + it.color + ';"></span>'
                + escapeHtml(it.label) + '</span>';
        }).join('');
    }

    function clearRack() {
        _clearNavigation();
        state.layoutMeta = null;
        state.pickables = [];
        state.slotIndex = [];
        state.camGroups = {};
        _clearStudio();
        if (!state.rackGroup) return;
        var disposedGeo = typeof Set !== 'undefined' ? new Set() : null;
        var disposedMat = typeof Set !== 'undefined' ? new Set() : null;
        state.rackGroup.traverse(function (ch) {
            if (ch.geometry) {
                if (!disposedGeo || !disposedGeo.has(ch.geometry)) {
                    if (disposedGeo) disposedGeo.add(ch.geometry);
                    ch.geometry.dispose();
                }
            }
            if (ch.material) {
                var mats = Array.isArray(ch.material) ? ch.material : [ch.material];
                mats.forEach(function (m) {
                    if (!m) return;
                    if (disposedMat && disposedMat.has(m)) return;
                    if (disposedMat) disposedMat.add(m);
                    m.dispose();
                });
            }
        });
        while (state.rackGroup.children.length) {
            state.rackGroup.remove(state.rackGroup.children[0]);
        }
        state._rackMats = null;
    }

    function _setInstanceColor(im, i, color) {
        if (typeof im.setColorAt === 'function') {
            im.setColorAt(i, color);
        } else if (im.instanceColor) {
            im.instanceColor.setXYZ(i, color.r, color.g, color.b);
        }
    }

    function finalizeInstancedMesh(im) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false;
        if (typeof im.computeBoundingSphere === 'function') {
            im.computeBoundingSphere();
        }
    }

    function _ruasCamara(cam) {
        var ruas = cam.ruas || [];
        if (ruas.length) return ruas;
        var seen = {};
        var out = [];
        (cam.slots || []).forEach(function (s) {
            var r = String(s.rua || '').trim().toUpperCase();
            if (r && !seen[r]) {
                seen[r] = true;
                out.push(r);
            }
        });
        return out.sort();
    }

    function _rackMaterials(THREE) {
        if (state._rackMats) return state._rackMats;
        state._rackMats = {
            blue: new THREE.MeshPhongMaterial({ color: COL_BLUE, shininess: 95, specular: 0x4488cc, emissive: 0x040e1e }),
            blueDark: new THREE.MeshPhongMaterial({ color: COL_BLUE_DARK, shininess: 55, specular: 0x1a3366, emissive: 0x020810 }),
            orange: new THREE.MeshPhongMaterial({ color: COL_ORANGE, shininess: 110, specular: 0xcc5500, emissive: 0x1a0800 }),
            bracing: new THREE.MeshPhongMaterial({ color: COL_BLUE, shininess: 75, specular: 0x3366aa, emissive: 0x030c1a }),
            deck: new THREE.MeshPhongMaterial({ color: COL_DECK, shininess: 30, specular: 0x664422 }),
            deckMetal: new THREE.MeshPhongMaterial({ color: COL_DECK_METAL, shininess: 140, specular: 0xaabbcc, emissive: 0x060a0d })
        };
        return state._rackMats;
    }

    function _slotInstanceMaterial(THREE) {
        var vc = THREE.VertexColors !== undefined ? THREE.VertexColors : true;
        return new THREE.MeshPhongMaterial({
            color: 0xffffff,
            vertexColors: vc,
            shininess: 35,
            specular: 0x222222
        });
    }

    function _rackXs(xBase, towardAisle) {
        var halfDepth = RACK_HALF_DEPTH;
        if (towardAisle > 0) {
            return { front: xBase + halfDepth, back: xBase - halfDepth };
        }
        return { front: xBase - halfDepth, back: xBase + halfDepth };
    }

    function _addBox(THREE, parent, w, h, d, x, y, z, mat) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
        return m;
    }

    function _addUprightHoles(THREE, parent, x, z, rackH, towardAisle, mats) {
        var holeX = towardAisle > 0 ? x + UPR_W * 0.52 : x - UPR_W * 0.52;
        var step = Math.max(LEVEL_H * 0.85, 0.55);
        for (var hy = step * 0.6; hy < rackH - 0.15; hy += step) {
            _addBox(THREE, parent, 0.012, 0.028, 0.012, holeX, hy, z, mats.blueDark);
        }
    }

    function _addUprightPair(THREE, parent, xF, xB, z, rackH, mats, towardAisle) {
        var foot = UPR_W * 2.8;
        var baseY = 0.018;
        _addBox(THREE, parent, foot, 0.036, foot, xF, baseY, z, mats.blue);
        _addBox(THREE, parent, foot, 0.036, foot, xB, baseY, z, mats.blue);
        var cy = rackH / 2 + 0.036;
        _addBox(THREE, parent, UPR_W, rackH, UPR_D, xF, cy, z, mats.blue);
        _addBox(THREE, parent, UPR_W, rackH, UPR_D, xB, cy, z, mats.blue);
        /* perfil C nas costas dos montantes */
        var flangeW = UPR_W * 0.55;
        var flangeD = UPR_D * 0.28;
        _addBox(THREE, parent, flangeW, rackH, flangeD, xF - (towardAisle > 0 ? 1 : -1) * (UPR_W * 0.72), cy, z, mats.blueDark);
        _addBox(THREE, parent, flangeW, rackH, flangeD, xB - (towardAisle > 0 ? 1 : -1) * (UPR_W * 0.72), cy, z, mats.blueDark);
        var aisleX = towardAisle > 0 ? xF : xB;
        _addUprightHoles(THREE, parent, aisleX, z, rackH, towardAisle, mats);
        var dx = xB - xF;
        var span = Math.abs(dx);
        var bT = 0.030;
        /* 3 bandas de X-brace ao longo da altura */
        var bands = [0, 0.36, 0.68];
        bands.forEach(function(start) {
            var y0 = rackH * start + 0.06;
            var y1 = rackH * (start + 0.34) - 0.06;
            var rise = y1 - y0;
            var lenD = Math.sqrt(span * span + rise * rise);
            var my = (y0 + y1) / 2;
            var bA = _addBox(THREE, parent, lenD, bT, bT, (xF + xB) / 2, my, z, mats.bracing);
            bA.rotation.z = Math.atan2(rise, dx);
            var bB = _addBox(THREE, parent, lenD, bT, bT, (xF + xB) / 2, my, z, mats.bracing);
            bB.rotation.z = -Math.atan2(rise, dx);
        });
        /* barras horizontais em cada nó */
        [0, 0.34, 0.68, 1.0].forEach(function(t) {
            _addBox(THREE, parent, span * 0.92, 0.022, 0.025, (xF + xB) / 2, rackH * t + (t > 0 ? 0 : 0.04), z, mats.bracing);
        });
    }

    function _addBeamRun(THREE, parent, xF, xB, z0, z1, y, mats, towardAisle) {
        var cx = (xF + xB) / 2;
        var cz = (z0 + z1) / 2;
        var w = Math.abs(xF - xB) + UPR_W;
        var d = Math.max(UPR_D, Math.abs(z1 - z0) + UPR_D * 0.5);
        /* alma da viga (horizontal) */
        _addBox(THREE, parent, w, BEAM_H * 0.72, d, cx, y - BEAM_H * 0.08, cz, mats.orange);
        /* aba superior */
        _addBox(THREE, parent, w, BEAM_H * 0.16, d * 1.05, cx, y + BEAM_H * 0.30, cz, mats.orange);
        /* aba inferior */
        _addBox(THREE, parent, w, BEAM_H * 0.12, d * 1.02, cx, y - BEAM_H * 0.44, cz, mats.orange);
        /* placa de reforço lateral (face do corredor) */
        var faceOff = towardAisle > 0 ? (w * 0.5 + 0.008) : -(w * 0.5 + 0.008);
        _addBox(THREE, parent, 0.018, BEAM_H * 0.85, d * 0.9, cx + faceOff, y - BEAM_H * 0.05, cz, mats.orange);
    }

    function _addBayDeck(THREE, parent, xF, xB, z0, z1, y, mat) {
        var cx = (xF + xB) / 2;
        var cz = (z0 + z1) / 2;
        var w = Math.abs(xF - xB) - UPR_W * 0.30;
        var d = Math.abs(z1 - z0) - 0.06;
        if (w < 0.12 || d < 0.12) return;
        /* piso principal (chapa) */
        _addBox(THREE, parent, w, SHELF_TH, d, cx, y, cz, mat);
        /* vigotas longitudinais de reforço debaixo do piso */
        var nVigas = Math.max(2, Math.round(d / 0.38));
        var vigaT = SHELF_TH * 0.55;
        var vigaH = SHELF_TH * 1.8;
        var zStep = d / (nVigas + 1);
        for (var vi = 1; vi <= nVigas; vi++) {
            var vz = (z0 + zStep * vi);
            _addBox(THREE, parent, w * 0.92, vigaH, vigaT, cx, y - vigaH * 0.5 - SHELF_TH * 0.1, vz, mat);
        }
    }

    function _zMarksUniformes(maxPos, bayStep) {
        maxPos = Math.max(1, parseInt(maxPos, 10) || 1);
        var zMarks = [0];
        for (var p = 1; p <= maxPos; p++) {
            zMarks.push(p * bayStep);
        }
        return zMarks;
    }

    function _aisleLenForMaxPos(maxPos) {
        maxPos = Math.max(1, parseInt(maxPos, 10) || 1);
        return maxPos * (SLOT_D + GAP_POS) + 0.5;
    }

    function _buildIndustrialRackSide(THREE, parent, xBase, towardAisle, rua, ruaSlots, camCod, shelfGeo, dummy, col, maxNiv, maxPos, levelH) {
        maxNiv = maxNiv || MAX_NIV;
        maxPos = Math.max(1, parseInt(maxPos, 10) || 1);
        if (!ruaSlots.length && maxPos < 1) return 0;
        var lh = levelH || LEVEL_H;
        var mats = _rackMaterials(THREE);
        var xs = _rackXs(xBase, towardAisle);
        var xF = xs.front;
        var xB = xs.back;
        var rackH = (maxNiv - 1) * lh + BEAM_H + SHELF_TH + (maxNiv >= MAX_NIV ? 0.55 : 0.28);
        var bayStep = SLOT_D + GAP_POS;
        var zMarks = _zMarksUniformes(maxPos, bayStep);
        zMarks.forEach(function (z) {
            _addUprightPair(THREE, parent, xF, xB, z, rackH, mats, towardAisle);
        });
        for (var n = 1; n <= maxNiv; n++) {
            var yBeam = (n - 1) * lh + BEAM_H * 0.5;
            var yDeck = (n - 1) * lh + BEAM_H + SHELF_TH * 0.22;
            var deckMat = n === maxNiv ? mats.deckMetal : mats.deck;
            for (var i = 0; i < zMarks.length - 1; i++) {
                _addBeamRun(THREE, parent, xF, xB, zMarks[i], zMarks[i + 1], yBeam, mats, towardAisle);
                _addBayDeck(THREE, parent, xF, xB, zMarks[i], zMarks[i + 1], yDeck, deckMat);
            }
        }

        _addLongarinaLabelsRack(THREE, parent, camCod, rua, maxPos, maxNiv, xF, xB, towardAisle, bayStep, lh);

        if (!ruaSlots.length) {
            return zMarks[zMarks.length - 1] + 0.2;
        }

        var mat = _slotInstanceMaterial(THREE);
        var im = new THREE.InstancedMesh(shelfGeo, mat, ruaSlots.length);
        if (THREE.DynamicDrawUsage && im.instanceMatrix && typeof im.instanceMatrix.setUsage === 'function') {
            im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        }
        im.userData = { isRack: true, camara: camCod, rua: rua };

        ruaSlots.forEach(function (slot, i) {
            var pos = parseInt(slot.posicao, 10) || 1;
            var niv = parseInt(slot.nivel, 10) || 1;
            var z = (pos - 1) * bayStep + SLOT_D / 2;
            var y = (niv - 1) * LEVEL_H + BEAM_H + SHELF_TH * 0.72;
            var cx = (xF + xB) / 2;
            dummy.position.set(cx, y, z);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);
            col.setHex(slotColor(slot));
            _setInstanceColor(im, i, col);
            state.slotIndex.push({ mesh: im, instanceId: i, slot: slot, camara: camCod });
        });
        finalizeInstancedMesh(im);
        im.castShadow = true;
        im.receiveShadow = true;
        parent.add(im);
        state.pickables.push(im);
        return zMarks[zMarks.length - 1] + 0.2;
    }

    function _ruaSlots(cam, rua) {
        return (cam.slots || []).filter(function (s) {
            return String(s.rua || '').toUpperCase() === String(rua || '').toUpperCase();
        });
    }

    function _camMaxPosNiv(slots) {
        var maxPos = 1;
        var maxNiv = 1;
        (slots || []).forEach(function (s) {
            var p = parseInt(s.posicao, 10) || 1;
            var n = parseInt(s.nivel, 10) || 1;
            if (p > maxPos) maxPos = p;
            if (n > maxNiv) maxNiv = n;
        });
        return { maxPos: maxPos, maxNiv: maxNiv };
    }

    function _filterSlotsNiv(slots, maxNiv) {
        maxNiv = maxNiv || MAX_NIV;
        return (slots || []).filter(function (s) {
            var n = parseInt(s.nivel, 10) || 1;
            return n >= 1 && n <= maxNiv;
        });
    }

    function _filterSlots15(slots) {
        return _filterSlotsNiv(slots, MAX_NIV);
    }

    function _rackXBase(ruaIndex, totalRuas) {
        var off = AISLE_W / 2 + SLOT_D * 0.58;
        if (totalRuas <= 1) return -(off);
        return ruaIndex === 0 ? -(off) : off;
    }

    /** Mantém racks próximos da parede divisória sem invadir o painel. */
    function _rackXBaseForCam(camCod, ruaIndex, totalRuas) {
        var base = _rackXBase(ruaIndex, totalRuas);
        var c = parseInt(camCod, 10);
        if (c !== 11 && c !== 12 && c !== 13) return base;

        var fpsW = AISLE_W + SLOT_D * 1.28 + CAM_FLOOR_PAD;
        var wallLine = fpsW / 2 + GAP_CAM_ADJ / 2 - WALL_DIV_TH / 2;
        var half = RACK_HALF_DEPTH;
        var gap = WALL_RACK_GAP;

        if (c === 12 && totalRuas >= 2) {
            if (ruaIndex === 0) {
                var minBack = -wallLine + gap;
                if (base - half < minBack) base = minBack + half;
            } else {
                var maxBack = wallLine - gap;
                if (base + half > maxBack) base = maxBack - half;
            }
            return base;
        }
        if (c === 13) {
            var minOuter = -wallLine + gap;
            if (base - half < minOuter) base = minOuter + half;
            return base;
        }
        if (c === 11) {
            var maxOuter11 = wallLine - gap;
            if (base + half > maxOuter11) base = maxOuter11 - half;
        }
        return base;
    }

    /** Passagem cinza que liga o corredor principal à câm. 21. */
    /** Limites reais dos racks no mundo (para paredes rente por fora). */
    function _computeRackBounds(camarasByCode, positions, camCodes) {
        var minX = Infinity;
        var maxX = -Infinity;
        var minZ = Infinity;
        var maxZ = -Infinity;
        (camCodes || []).forEach(function (cod) {
            var cam = camarasByCode[cod];
            var pos = positions[cod];
            if (!cam || !pos) return;
            var ruas = _ruasCamara(cam);
            var maxNivCap = _maxNivCam(cod);
            var layoutNiv = parseInt(cam.niveis, 10);
            var maxNiv = layoutNiv > 0 ? Math.min(layoutNiv, maxNivCap) : maxNivCap;
            var slots = _filterSlotsNiv(cam.slots, maxNiv);
            var maxPos = slots.length ? _camMaxPosicao(slots, ruas) : 1;
            var aisleLen = _aisleLenForMaxPos(maxPos) + 0.5;
            ruas.forEach(function (rua, ri) {
                var xBase = _rackXBaseForCam(cod, ri, ruas.length);
                var toward = ri === 0 ? 1 : -1;
                if (ruas.length <= 1) toward = 1;
                var xs = _rackXs(xBase, toward);
                minX = Math.min(minX, pos.x + xs.front, pos.x + xs.back);
                maxX = Math.max(maxX, pos.x + xs.front, pos.x + xs.back);
            });
            minZ = Math.min(minZ, pos.z);
            maxZ = Math.max(maxZ, pos.z + aisleLen + 0.8);
        });
        if (!isFinite(minX)) return null;
        return { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    }

    function _passagemCam21(corridors, passagem21) {
        if (passagem21 && passagem21.x != null) return passagem21;
        var list = corridors || [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (!c) continue;
            if (c.axis === 'z' || (c.label && c.label.indexOf('CÂM 21') >= 0)) return c;
        }
        return null;
    }

    function _camFloorBounds(cod, positions, camarasByCode, rackBounds) {
        var pos = positions[cod];
        var cam = camarasByCode[cod];
        if (!pos || !cam) return rackBounds;
        var fp = _camFootprint(cam);
        if (!fp) return rackBounds;
        var halfW = fp.width / 2;
        var minZ = rackBounds ? rackBounds.minZ : pos.z;
        var maxZ = rackBounds ? rackBounds.maxZ : pos.z + fp.depth;
        return {
            minX: pos.x - halfW,
            maxX: pos.x + halfW,
            minZ: minZ,
            maxZ: maxZ
        };
    }

    function _camMaxPosicao(slots, ruas) {
        var max = 1;
        var ruasUp = (ruas || []).map(function (r) { return String(r || '').trim().toUpperCase(); });
        (slots || []).forEach(function (s) {
            var rua = String(s.rua || '').trim().toUpperCase();
            if (ruasUp.length && ruasUp.indexOf(rua) < 0) return;
            var p = parseInt(s.posicao, 10) || 0;
            if (p > max) max = p;
        });
        return max;
    }

    function _camFootprint(cam) {
        var ruas = _ruasCamara(cam);
        var cod = parseInt(cam.codigo, 10);
        var maxNivCap = _maxNivCam(cod);
        var layoutNiv = parseInt(cam.niveis, 10);
        var maxNiv = layoutNiv > 0 ? Math.min(layoutNiv, maxNivCap) : maxNivCap;
        var slots = _filterSlotsNiv(cam.slots, maxNiv);
        if (!slots.length) return null;
        var maxPos = _camMaxPosicao(slots, ruas);
        var aisleLen = _aisleLenForMaxPos(maxPos);
        var floorW = AISLE_W + SLOT_D * 1.28;
        return {
            width: floorW + CAM_FLOOR_PAD,
            depth: aisleLen + 0.8,
            aisleLen: aisleLen
        };
    }

    /** Planta CD: 11/12/13 em fila; corredor cinza na frente do bloco e na frente da cam 21. */
    function _layoutCdPlanta(camarasByCode) {
        var leftCodes = [11, 12, 13];
        var fps = {};
        leftCodes.forEach(function (c) {
            if (camarasByCode[c]) fps[c] = _camFootprint(camarasByCode[c]);
        });
        var fp21 = camarasByCode[21] ? _camFootprint(camarasByCode[21]) : null;

        var leftSpan = 0;
        var maxDepthLeft = 0;
        leftCodes.forEach(function (c) {
            if (!fps[c]) return;
            leftSpan += fps[c].width + GAP_CAM_ADJ;
            if (fps[c].depth > maxDepthLeft) maxDepthLeft = fps[c].depth;
        });
        if (leftSpan > 0) leftSpan -= GAP_CAM_ADJ;

        var startX = leftSpan ? -leftSpan / 2 : 0;
        var positions = {};
        var corridors = [];
        var xCursor = startX;

        leftCodes.forEach(function (c) {
            if (!fps[c]) return;
            positions[c] = { x: xCursor + fps[c].width / 2, z: 0 };
            xCursor += fps[c].width + GAP_CAM_ADJ;
        });

        if (leftSpan) {
            var mainCorridorZ = maxDepthLeft + MAIN_AISLE_W / 2;
            if (fp21 && positions[13]) {
                var passageX = positions[13].x;
                var passageW = Math.max((fp21.width || AISLE_W) * 0.92, AISLE_W);
                var blockLeft = -leftSpan / 2;
                var passageLeft = passageX - passageW / 2;
                var passageRight = passageX + passageW / 2;
                var mainW = passageRight - blockLeft;
                if (mainW > 0.8) {
                    corridors.push({
                        width: mainW,
                        depth: MAIN_AISLE_W,
                        x: blockLeft + mainW / 2,
                        z: mainCorridorZ,
                        label: 'CORREDOR PRINCIPAL — CÂM 11 · 12 · 13'
                    });
                }
                corridors.push({
                    width: passageW,
                    depth: MAIN_AISLE_W,
                    x: passageX,
                    z: mainCorridorZ,
                    silent: true
                });
            } else {
                corridors.push({
                    width: leftSpan,
                    depth: MAIN_AISLE_W,
                    x: 0,
                    z: mainCorridorZ,
                    label: 'CORREDOR PRINCIPAL — CÂM 11 · 12 · 13'
                });
            }
        }

        if (leftSpan && fp21) {
            var x13 = positions[13] ? positions[13].x : 0;
            positions[21] = { x: x13, z: maxDepthLeft + MAIN_AISLE_W };
            corridors.push({
                width: leftSpan,
                depth: MAIN_AISLE_W,
                x: 0,
                z: maxDepthLeft + MAIN_AISLE_W + fp21.depth + MAIN_AISLE_W / 2,
                label: 'CORREDOR — CÂM. 21'
            });
        } else if (fp21) {
            positions[21] = { x: 0, z: 0 };
        }

        var passagem21 = null;
        if (leftSpan && fp21 && positions[13]) {
            passagem21 = {
                x: positions[13].x,
                z: maxDepthLeft + MAIN_AISLE_W / 2,
                width: Math.max((fp21.width || AISLE_W) * 0.92, AISLE_W)
            };
        }

        return { positions: positions, corridors: corridors, passagem21: passagem21 };
    }

    function _addCorridorPlane(THREE, parent, w, d, cx, cz, name, label, silent) {
        var y = 0.012;
        var baseMat = new THREE.MeshPhongMaterial({
            color: COL_CORRIDOR,
            shininess: 8,
            specular: 0x222222,
            side: THREE.DoubleSide
        });
        var base = new THREE.Mesh(new THREE.PlaneGeometry(w, d), baseMat);
        base.name = name || 'corredor';
        base.rotation.x = -Math.PI / 2;
        base.position.set(cx, y, cz);
        base.receiveShadow = true;
        parent.add(base);

        var edgeMat = new THREE.MeshBasicMaterial({ color: COL_CORRIDOR_EDGE, side: THREE.DoubleSide });
        var edgeW = Math.min(0.14, w * 0.012);
        var edgeD = Math.min(0.14, d * 0.04);
        [-1, 1].forEach(function (signX) {
            var edge = new THREE.Mesh(new THREE.PlaneGeometry(edgeW, d * 0.96), edgeMat);
            edge.rotation.x = -Math.PI / 2;
            edge.position.set(cx + signX * (w / 2 - edgeW * 0.6), y + 0.001, cz);
            parent.add(edge);
        });
        [-1, 1].forEach(function (signZ) {
            var edgeZ = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, edgeD), edgeMat);
            edgeZ.rotation.x = -Math.PI / 2;
            edgeZ.position.set(cx, y + 0.001, cz + signZ * (d / 2 - edgeD * 0.6));
            parent.add(edgeZ);
        });

        if (label && !silent) {
            var lbl = _textPlane(THREE, label, Math.min(w * 0.94, 16), 1.15, 38, '#ffffff', 'rgba(33,33,33,0.78)');
            lbl.rotation.x = -Math.PI / 2;
            lbl.position.set(cx, y + 0.004, cz);
            parent.add(lbl);
        }
    }

    function _addCamGapStripes(THREE, parent, leftCodes, fps, positions, maxDepth) {
        if (!leftCodes || leftCodes.length < 2 || !maxDepth) return;
        var mat = new THREE.MeshBasicMaterial({ color: 0x90a4ae, side: THREE.DoubleSide });
        for (var i = 0; i < leftCodes.length - 1; i++) {
            var cA = leftCodes[i];
            var cB = leftCodes[i + 1];
            if (!fps[cA] || !fps[cB] || !positions[cA] || !positions[cB]) continue;
            var xA = positions[cA].x + fps[cA].width / 2;
            var xB = positions[cB].x - fps[cB].width / 2;
            var cx = (xA + xB) / 2;
            var gw = Math.max(xB - xA, 0.08);
            var stripe = new THREE.Mesh(new THREE.PlaneGeometry(gw, maxDepth * 0.98), mat);
            stripe.rotation.x = -Math.PI / 2;
            stripe.position.set(cx, 0.006, maxDepth / 2);
            stripe.name = 'vao-cam-' + cA + '-' + cB;
            parent.add(stripe);
        }
    }

    /** Paredes divisórias verticais entre câmaras 11|12 e 12|13 (vãos laterais). */
    function _addChamberDividerWalls(THREE, parent, leftCodes, fps, positions, rackBounds, wallH) {
        if (!leftCodes || leftCodes.length < 2 || !rackBounds || !wallH) return;
        var group = new THREE.Group();
        group.name = 'paredes-divisorias';
        var panelMat = new THREE.MeshPhongMaterial({
            color: COL_WALL_DIV,
            shininess: 10,
            specular: 0x333333,
            side: THREE.DoubleSide
        });
        var frameMat = new THREE.MeshPhongMaterial({
            color: COL_WALL_FRAME,
            shininess: 6,
            specular: 0x111111
        });
        var depth = rackBounds.maxZ - rackBounds.minZ;
        var cz = rackBounds.minZ + depth / 2;
        var frameTh = 0.07;
        for (var i = 0; i < leftCodes.length - 1; i++) {
            var cA = leftCodes[i];
            var cB = leftCodes[i + 1];
            if (!fps[cA] || !fps[cB] || !positions[cA] || !positions[cB]) continue;
            var xA = positions[cA].x + fps[cA].width / 2;
            var xB = positions[cB].x - fps[cB].width / 2;
            var cx = (xA + xB) / 2;
            var wall = new THREE.Mesh(new THREE.BoxGeometry(WALL_DIV_TH, wallH, depth), panelMat);
            wall.position.set(cx, wallH / 2, cz);
            wall.castShadow = true;
            wall.receiveShadow = true;
            wall.name = 'parede-cam-' + cA + '-' + cB;
            group.add(wall);
            var capH = 0.1;
            var cap = new THREE.Mesh(new THREE.BoxGeometry(WALL_DIV_TH + frameTh * 2, capH, depth), frameMat);
            cap.position.set(cx, wallH + capH / 2, cz);
            group.add(cap);
            var base = new THREE.Mesh(new THREE.BoxGeometry(WALL_DIV_TH + frameTh * 2, 0.08, depth), frameMat);
            base.position.set(cx, 0.04, cz);
            group.add(base);
            [-1, 1].forEach(function (signX) {
                var post = new THREE.Mesh(new THREE.BoxGeometry(frameTh, wallH, frameTh), frameMat);
                post.position.set(cx + signX * (WALL_DIV_TH / 2 + frameTh * 0.45), wallH / 2, rackBounds.minZ + frameTh * 0.5);
                group.add(post);
                var postBack = post.clone();
                postBack.position.z = rackBounds.maxZ - frameTh * 0.5;
                group.add(postBack);
            });
            var lblA = _textPlane(THREE, 'CÂM. ' + String(cA), 0.72, 0.42, 56, '#263238', 'rgba(255,255,255,0.9)');
            lblA.position.set(cx + WALL_DIV_TH * 0.72, wallH * 0.62, cz + depth * 0.14);
            group.add(lblA);
            var lblB = _textPlane(THREE, 'CÂM. ' + String(cB), 0.72, 0.42, 56, '#263238', 'rgba(255,255,255,0.9)');
            lblB.position.set(cx - WALL_DIV_TH * 0.72, wallH * 0.62, cz + depth * 0.14);
            lblB.rotation.y = Math.PI;
            group.add(lblB);
        }
        parent.add(group);
    }

    function _wallMats(THREE) {
        return {
            panel: new THREE.MeshPhongMaterial({
                color: COL_WALL_DIV,
                shininess: 10,
                specular: 0x333333,
                side: THREE.DoubleSide
            }),
            frame: new THREE.MeshPhongMaterial({
                color: COL_WALL_FRAME,
                shininess: 6,
                specular: 0x111111
            })
        };
    }

    function _addWallRunZ(group, mats, wallH, x, zCenter, depth, name) {
        if (!depth || depth < 0.06) return;
        var frameTh = 0.07;
        var panel = new THREE.Mesh(new THREE.BoxGeometry(WALL_DIV_TH, wallH, depth), mats.panel);
        panel.position.set(x, wallH / 2, zCenter);
        panel.castShadow = true;
        panel.receiveShadow = true;
        panel.name = name || 'parede-z';
        group.add(panel);
        var cap = new THREE.Mesh(
            new THREE.BoxGeometry(WALL_DIV_TH + frameTh * 2, 0.1, depth),
            mats.frame
        );
        cap.position.set(x, wallH + 0.05, zCenter);
        group.add(cap);
        var base = new THREE.Mesh(
            new THREE.BoxGeometry(WALL_DIV_TH + frameTh * 2, 0.08, depth),
            mats.frame
        );
        base.position.set(x, 0.04, zCenter);
        group.add(base);
    }

    function _addWallRunX(group, mats, wallH, width, xCenter, z, name) {
        if (!width || width < 0.06) return;
        var frameTh = 0.07;
        var panel = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, WALL_DIV_TH), mats.panel);
        panel.position.set(xCenter, wallH / 2, z);
        panel.castShadow = true;
        panel.receiveShadow = true;
        panel.name = name || 'parede-x';
        group.add(panel);
        var cap = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.1, WALL_DIV_TH + frameTh * 2),
            mats.frame
        );
        cap.position.set(xCenter, wallH + 0.05, z);
        group.add(cap);
        var base = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.08, WALL_DIV_TH + frameTh * 2),
            mats.frame
        );
        base.position.set(xCenter, 0.04, z);
        group.add(base);
    }

    function _addWallRunXWithDoor(THREE, group, mats, wallH, width, xCenter, z, name) {
        if (!width || width < 0.06) return;
        var doorW = Math.min(1.4, width * 0.18);
        var doorH = Math.min(wallH * 0.42, 3.0);
        var sideW = (width - doorW) / 2;
        /* painel esquerdo */
        _addWallRunX(group, mats, wallH, sideW, xCenter - doorW / 2 - sideW / 2, z, name + '-esq');
        /* painel direito */
        _addWallRunX(group, mats, wallH, sideW, xCenter + doorW / 2 + sideW / 2, z, name + '-dir');
        /* trecho acima da porta */
        var frameTh = 0.07;
        var overH = wallH - doorH;
        var THREE_obj = T ? T() : THREE;
        var panelMat = mats.panel;
        var frameMat = mats.frame;
        var overPan = new THREE_obj.Mesh(new THREE_obj.BoxGeometry(doorW, overH, WALL_DIV_TH), panelMat);
        overPan.position.set(xCenter, doorH + overH / 2, z);
        group.add(overPan);
        /* marco da porta */
        var jambH = doorH + 0.06;
        var jambW = 0.10;
        var doorMat = new THREE_obj.MeshPhongMaterial({ color: 0xd4c5b0, shininess: 60, specular: 0x888866 });
        /* jambas laterais */
        [xCenter - doorW / 2 - jambW / 2, xCenter + doorW / 2 + jambW / 2].forEach(function (jx) {
            var j = new THREE_obj.Mesh(new THREE_obj.BoxGeometry(jambW, jambH, WALL_DIV_TH * 1.3), frameMat);
            j.position.set(jx, jambH / 2, z);
            group.add(j);
        });
        /* verga (topo do marco) */
        var vg = new THREE_obj.Mesh(new THREE_obj.BoxGeometry(doorW + jambW * 2, 0.10, WALL_DIV_TH * 1.3), frameMat);
        vg.position.set(xCenter, doorH + 0.05, z);
        group.add(vg);
        /* folha da porta (ligeiramente aberta ~15°) */
        var leafGeo = new THREE_obj.BoxGeometry(doorW - 0.06, doorH - 0.08, 0.055);
        var leaf = new THREE_obj.Mesh(leafGeo, doorMat);
        var angle = 0.26;
        leaf.position.set(
            xCenter + (doorW / 2 - 0.04) * (1 - Math.cos(angle)),
            doorH / 2,
            z + (doorW / 2 - 0.04) * Math.sin(angle)
        );
        leaf.rotation.y = -angle;
        group.add(leaf);
        /* maçaneta */
        var knob = new THREE_obj.Mesh(new THREE_obj.SphereGeometry(0.06, 8, 8), new THREE_obj.MeshPhongMaterial({ color: 0xb8860b, shininess: 160 }));
        knob.position.set(
            xCenter + (doorW / 2 - 0.18) * Math.cos(-angle),
            doorH * 0.50,
            z + (doorW / 2 - 0.18) * Math.sin(-angle) + 0.06
        );
        group.add(knob);
    }

    /** Paredes externas rente ao bloco 11–13 e envoltório da câm. 21 (por fora dos racks). */
    function _addPerimeterWalls(THREE, parent, wallH, positions, camarasByCode, corridors, passagem21) {
        if (!wallH || !positions || !camarasByCode) return;
        var b113 = _computeRackBounds(camarasByCode, positions, [11, 12, 13]);
        if (!b113) return;
        var bAll = _computeRackBounds(camarasByCode, positions, [11, 12, 13, 21]) || b113;
        var b21 = positions[21] ? _computeRackBounds(camarasByCode, positions, [21]) : null;

        var group = new THREE.Group();
        group.name = 'paredes-perimetro';
        var mats = _wallMats(THREE);
        var out = WALL_OUTSET;
        var halfTh = WALL_DIV_TH / 2;
        var leftX = bAll.minX - halfTh - out;
        var rightX = bAll.maxX + halfTh + out;
        var backZ = bAll.minZ - halfTh - out;
        var backW = (bAll.maxX - bAll.minX) + WALL_DIV_TH + out * 2;
        var d113 = b113.maxZ - b113.minZ;
        var dAll = bAll.maxZ - bAll.minZ;

        _addWallRunX(group, mats, wallH, backW, (bAll.minX + bAll.maxX) / 2, backZ, 'parede-fundo');
        _addWallRunZ(group, mats, wallH, leftX, b113.minZ + d113 / 2, d113, 'parede-esq-bloco');
        _addWallRunZ(group, mats, wallH, rightX, b113.minZ + d113 / 2, d113, 'parede-dir-bloco');

        if (b21) {
            var f21 = _camFloorBounds(21, positions, camarasByCode, b21);
            var leftX21 = f21.minX - halfTh - out;
            var rightX21 = f21.maxX + halfTh + out;
            var frontZ21 = f21.minZ - halfTh - out;
            var rearZ21 = f21.maxZ + halfTh + out;
            var d21Full = rearZ21 - frontZ21 + WALL_DIV_TH;
            var cz21 = (frontZ21 + rearZ21) / 2;
            var rearW21 = rightX21 - leftX21 + WALL_DIV_TH;
            var rearCx = (leftX21 + rightX21) / 2;

            _addWallRunX(group, mats, wallH, rearW21, rearCx, frontZ21, 'parede-frente-21');
            _addWallRunXWithDoor(THREE, group, mats, wallH, rearW21, rearCx, rearZ21, 'parede-fundo-21');
            _addWallRunZ(group, mats, wallH, leftX21, cz21, d21Full, 'parede-esq-21');

            /* fechamento das laterais do corredor entre o bloco 11-13 e a câm. 21 */
            var corrZ0 = b113.maxZ + halfTh;
            var corrZ1 = frontZ21 - halfTh;
            if (corrZ1 > corrZ0 + 0.2) {
                var corrD = corrZ1 - corrZ0;
                var corrCz = (corrZ0 + corrZ1) / 2;
                _addWallRunZ(group, mats, wallH, leftX, corrCz, corrD, 'parede-esq-corredor');
                _addWallRunZ(group, mats, wallH, rightX, corrCz, corrD, 'parede-dir-corredor');
            }
        }

        parent.add(group);
    }

    function buildOneCamara(THREE, cam, posX, posZ, shelfGeo, dummy, col) {
        var ruas = _ruasCamara(cam);
        var cod = parseInt(cam.codigo, 10);
        var maxNivCap = _maxNivCam(cod);
        var layoutNiv = parseInt(cam.niveis, 10);
        var maxNiv = layoutNiv > 0 ? Math.min(layoutNiv, maxNivCap) : maxNivCap;
        var slots = _filterSlotsNiv(cam.slots, maxNiv);
        if (!slots.length) return null;
        var maxPos = _camMaxPosicao(slots, ruas);

        var levelH = _levelHForCam(cod);
        var camGroup = new THREE.Group();
        camGroup.name = 'camara-' + cod;
        var aisleLen = _aisleLenForMaxPos(maxPos);

        ruas.forEach(function (rua, ri) {
            var ruaSlots = _ruaSlots(cam, rua).filter(function (s) {
                var n = parseInt(s.nivel, 10) || 1;
                return n >= 1 && n <= maxNiv;
            });
            var xBase = _rackXBaseForCam(cod, ri, ruas.length);
            var towardAisle = ri === 0 ? 1 : -1;
            if (ruas.length <= 1) towardAisle = 1;
            var ruaGroup = new THREE.Group();
            ruaGroup.name = 'rua-' + rua;
            var len = _buildIndustrialRackSide(THREE, ruaGroup, xBase, towardAisle, rua, ruaSlots, cod, shelfGeo, dummy, col, maxNiv, maxPos, levelH);
            if (len > aisleLen) aisleLen = len;
            camGroup.add(ruaGroup);
        });

        if (aisleLen < 1) return null;
        aisleLen += 0.5;

        var aisleGeo = new THREE.PlaneGeometry(AISLE_W, aisleLen);
        var aisleMat = new THREE.MeshPhongMaterial({ color: 0xfafafa, shininess: 14, specular: 0xcccccc, side: THREE.DoubleSide });
        var aisle = new THREE.Mesh(aisleGeo, aisleMat);
        aisle.rotation.x = -Math.PI / 2;
        aisle.position.set(0, -0.02, aisleLen / 2);
        camGroup.add(aisle);

        _addCorridorSignage(THREE, camGroup, aisleLen, cod);

        var floorW = AISLE_W + SLOT_D * 1.28;
        var floorGeo = new THREE.PlaneGeometry(floorW, aisleLen + 0.8);
        var floorMat = new THREE.MeshPhongMaterial({ color: COL_FLOOR, shininess: 5, side: THREE.DoubleSide });
        var floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, -0.04, aisleLen / 2);
        camGroup.add(floor);

        var totalW = floorW + CAM_FLOOR_PAD;
        camGroup.position.set(posX, 0, posZ);
        state.rackGroup.add(camGroup);
        state.camGroups[String(cod)] = camGroup;
        return { cod: cod, width: totalW, depth: aisleLen + 0.8 };
    }

    function buildRack(data) {
        return buildRackAsync(data);
    }

    function buildRackAsync(data) {
        return ensureThree().then(function () {
            var THREE = T();
            clearRack();
            if (!data || !data.camaras || !data.camaras.length) {
                return Promise.reject(new Error('Dados do mapa 3D inválidos.'));
            }
            if (!state.rackGroup) {
                return Promise.reject(new Error('Renderizador 3D não inicializado.'));
            }

            var pendingFilter = state.camFilter;
            var camaras = _sortCamaras(data.camaras);
            var camarasByCode = {};
            camaras.forEach(function (c) {
                camarasByCode[parseInt(c.codigo, 10)] = c;
            });
            var layout = _layoutCdPlanta(camarasByCode);
            var leftCodes = [11, 12, 13];
            var fpsLayout = {};
            leftCodes.forEach(function (c) {
                if (camarasByCode[c]) fpsLayout[c] = _camFootprint(camarasByCode[c]);
            });
            var maxDepthLeft = 0;
            var leftSpan = 0;
            leftCodes.forEach(function (c) {
                if (!fpsLayout[c]) return;
                leftSpan += fpsLayout[c].width + GAP_CAM_ADJ;
                if (fpsLayout[c].depth > maxDepthLeft) maxDepthLeft = fpsLayout[c].depth;
            });
            if (leftSpan > 0) leftSpan -= GAP_CAM_ADJ;
            var fp21 = camarasByCode[21] ? _camFootprint(camarasByCode[21]) : null;
            if (fp21) fpsLayout[21] = fp21;
            var rightEdge = 0;
            leftCodes.forEach(function (c) {
                if (layout.positions[c] && fpsLayout[c]) {
                    var edge = layout.positions[c].x + fpsLayout[c].width / 2;
                    if (edge > rightEdge) rightEdge = edge;
                }
            });
            if (layout.positions[21] && fp21) {
                var e21 = layout.positions[21].x + fp21.width / 2;
                if (e21 > rightEdge) rightEdge = e21;
            }
            state.layoutMeta = {
                positions: layout.positions,
                maxDepthLeft: maxDepthLeft,
                leftSpan: leftSpan,
                rightEdge: rightEdge,
                corridorMainZ: maxDepthLeft + MAIN_AISLE_W / 2,
                corridor21Z: layout.passagem21
                    ? layout.passagem21.z
                    : (maxDepthLeft + MAIN_AISLE_W * 0.75),
                passagem21: layout.passagem21 || null,
                camRuas: {}
            };
            camaras.forEach(function (c) {
                state.layoutMeta.camRuas[parseInt(c.codigo, 10)] = _ruasCamara(c);
            });
            var shelfGeo = new THREE.BoxGeometry(BEAM_FACE * 1.02, SHELF_TH, SLOT_D * 0.92);
            var dummy = new THREE.Object3D();
            var col = new THREE.Color();
            var buildOrder = [11, 12, 13, 21].filter(function (cod) {
                return camarasByCode[cod] && layout.positions[cod];
            });
            var idx = 0;

            (layout.corridors || []).forEach(function (cor, i) {
                _addCorridorPlane(
                    THREE,
                    state.rackGroup,
                    cor.width,
                    cor.depth,
                    cor.x,
                    cor.z,
                    'corredor-' + (i + 1),
                    cor.label,
                    cor.silent
                );
            });
            _addCamGapStripes(THREE, state.rackGroup, leftCodes, fpsLayout, layout.positions, maxDepthLeft);
            var maxNivWall = MAX_NIV;
            leftCodes.forEach(function (c) {
                if (!camarasByCode[c]) return;
                var cap = _maxNivCam(c);
                var layoutNiv = parseInt(camarasByCode[c].niveis, 10);
                var n = layoutNiv > 0 ? Math.min(layoutNiv, cap) : cap;
                if (n > maxNivWall) maxNivWall = n;
            });
            var rackBounds113 = _computeRackBounds(camarasByCode, layout.positions, [11, 12, 13]);
            _addChamberDividerWalls(
                THREE,
                state.rackGroup,
                leftCodes,
                fpsLayout,
                layout.positions,
                rackBounds113,
                maxNivWall * LEVEL_H + 0.65
            );
            _addPerimeterWalls(
                THREE,
                state.rackGroup,
                maxNivWall * LEVEL_H + 0.65,
                layout.positions,
                camarasByCode,
                layout.corridors,
                layout.passagem21
            );

            return new Promise(function (resolve, reject) {
                function next() {
                    if (idx >= buildOrder.length) {
                        if (!state.rackGroup.children.length) {
                            return reject(new Error('Nenhum rack montado no mapa 3D. Verifique layout e ruas.'));
                        }
                        onResize();
                        state.camFilter = pendingFilter;
                        _applyCamFilter(true);
                        renderFrame();
                        return resolve();
                    }
                    try {
                        var cod = buildOrder[idx];
                        var pos = layout.positions[cod];
                        buildOneCamara(THREE, camarasByCode[cod], pos.x, pos.z, shelfGeo, dummy, col);
                    } catch (err) {
                        return reject(err);
                    }
                    idx += 1;
                    requestAnimationFrame(next);
                }
                next();
            });
        });
    }

    function _clearStudio() {
        if (state._studioGroup && state.scene) {
            state.scene.remove(state._studioGroup);
            state._studioGroup.traverse(function (ch) {
                if (ch.geometry) ch.geometry.dispose();
                if (ch.material) {
                    if (Array.isArray(ch.material)) ch.material.forEach(function (m) { m.dispose(); });
                    else ch.material.dispose();
                }
            });
        }
        state._studioGroup = null;
    }

    function _addStudioEnvironment(box) {
        var THREE = T();
        _clearStudio();
        if (!state.scene || box.isEmpty()) return;
        var center = box.getCenter(new THREE.Vector3());
        var size = box.getSize(new THREE.Vector3());
        var group = new THREE.Group();
        group.name = 'studio';
        var pw = Math.max(size.x + 24, 48);
        var pd = Math.max(size.z + 16, 24);
        var floor = new THREE.Mesh(
            new THREE.PlaneGeometry(pw, pd),
            new THREE.MeshPhongMaterial({ color: 0xeceff1, shininess: 12, specular: 0x222222 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(center.x, -0.058, center.z);
        floor.receiveShadow = true;
        group.add(floor);
        if (THREE.GridHelper) {
            var gSize = Math.max(pw, pd);
            var grid = new THREE.GridHelper(gSize, Math.min(40, Math.max(12, Math.floor(gSize / 2))), 0x90a4ae, 0xeceff1);
            grid.position.set(center.x, -0.052, center.z);
            group.add(grid);
        }
        state.scene.add(group);
        state._studioGroup = group;
    }

    function _cancelCamIntro() {
        if (state._camIntroId) {
            cancelAnimationFrame(state._camIntroId);
            state._camIntroId = null;
        }
    }

    function _runCameraIntro(fromPos, toPos, target, ms) {
        _cancelCamIntro();
        if (!state.camera || !state.controls) return;
        var THREE = T();
        var fp = fromPos.clone();
        var tp = toPos.clone();
        var tt = target.clone();
        state.camera.position.copy(fp);
        state.controls.target.copy(tt);
        state.controls.update();
        var t0 = null;
        ms = ms || 1100;
        function step(ts) {
            if (!state.camera) return;
            if (!t0) t0 = ts;
            var k = Math.min((ts - t0) / ms, 1);
            k = k * k * (3 - 2 * k);
            state.camera.position.lerpVectors(fp, tp, k);
            state.controls.target.copy(tt);
            state.controls.update();
            renderFrame();
            if (k < 1) state._camIntroId = requestAnimationFrame(step);
            else {
                state._camIntroId = null;
                state.defaultCamPos = tp.clone();
                state.defaultTarget = tt.clone();
            }
        }
        state._camIntroId = requestAnimationFrame(step);
    }

    function _boxFromRackGroup(rackGroup) {
        var THREE = T();
        var box = new THREE.Box3();
        if (!rackGroup) return box;
        rackGroup.updateMatrixWorld(true);
        rackGroup.traverse(function (ch) {
            if (ch.isInstancedMesh) {
                if (typeof ch.computeBoundingSphere === 'function') ch.computeBoundingSphere();
                if (ch.boundingSphere) {
                    var bs = ch.boundingSphere;
                    var c = bs.center.clone();
                    ch.localToWorld(c);
                    var r = Math.max(bs.radius || 0, 0.5);
                    box.expandByPoint(new THREE.Vector3(c.x + r, c.y + r, c.z + r));
                    box.expandByPoint(new THREE.Vector3(c.x - r, c.y - r, c.z - r));
                }
                return;
            }
            if (ch.isMesh) {
                if (!ch.geometry) return;
                if (!ch.geometry.boundingBox) ch.geometry.computeBoundingBox();
                if (ch.geometry.boundingBox) {
                    var b = ch.geometry.boundingBox.clone();
                    b.applyMatrix4(ch.matrixWorld);
                    box.union(b);
                }
            }
        });
        return box;
    }

    function _showcaseCameraPos(box, center, size, maxDim) {
        var dist = Math.max(maxDim * 1.05, 14);
        return {
            x: center.x - dist * 0.78,
            y: center.y + Math.max(size.y * 0.55, dist * 0.42),
            z: center.z + dist * 0.55
        };
    }

    function _computeVisibleBox() {
        var THREE = T();
        if (!state.rackGroup) return new THREE.Box3();
        if (state.camFilter && state.camGroups[String(state.camFilter)]) {
            var g = state.camGroups[String(state.camFilter)];
            if (g && g.visible) return _boxFromRackGroup(g);
        }
        var visBox = new THREE.Box3();
        var hasVis = false;
        state.rackGroup.children.forEach(function (ch) {
            if (ch.visible) {
                var b = _boxFromRackGroup(ch);
                if (!b.isEmpty()) {
                    if (!hasVis) { visBox.copy(b); hasVis = true; }
                    else visBox.union(b);
                }
            }
        });
        return hasVis ? visBox : _boxFromRackGroup(state.rackGroup);
    }

    function _fallbackCamera(intro) {
        if (!state.camera || !state.controls) return;
        var THREE = T();
        var dest = new THREE.Vector3(-38, 18, 22);
        var target = new THREE.Vector3(28, 2.5, 8);
        if (intro) {
            var from = dest.clone().add(new THREE.Vector3(-14, 10, 12));
            _runCameraIntro(from, dest, target);
        } else {
            state.camera.position.copy(dest);
            state.controls.target.copy(target);
            state.controls.update();
            state.defaultCamPos = dest.clone();
            state.defaultTarget = target.clone();
            renderFrame();
        }
    }

    function centerCameraOnRack(intro, preferInterior) {
        if (!state.rackGroup || !state.camera || !state.controls) return;
        var THREE = T();
        if (preferInterior !== false && state.camFilter) {
            var interior = _interiorCameraPos(state.camFilter);
            if (interior) {
                state.interiorMode = true;
                _setExplorationControls(true, state.camFilter);
                _cancelCamIntro();
                _clearStudio();
                if (intro !== false) {
                    var fromPos = state.camera.position.clone();
                    var fromTgt = state.controls.target.clone();
                    _animateCameraTo(fromPos, fromTgt, interior.pos, interior.target, 1050, function () {
                        state.defaultCamPos = interior.pos.clone();
                        state.defaultTarget = interior.target.clone();
                        renderFrame();
                    });
                } else {
                    state.camera.position.copy(interior.pos);
                    state.controls.target.copy(interior.target);
                    state.controls.update();
                    state.defaultCamPos = interior.pos.clone();
                    state.defaultTarget = interior.target.clone();
                    renderFrame();
                }
                return;
            }
        }
        state.interiorMode = false;
        _setExplorationControls(false, null);
        var box = _computeVisibleBox();
        if (box.isEmpty()) {
            _fallbackCamera(intro !== false);
            return;
        }
        _addStudioEnvironment(box);
        var center = box.getCenter(new THREE.Vector3());
        var size = box.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z, 8);
        var sp = _showcaseCameraPos(box, center, size, maxDim);
        var dest = new THREE.Vector3(sp.x, sp.y, sp.z);
        if (intro !== false) {
            var fromExt = dest.clone().add(new THREE.Vector3(-maxDim * 0.55, maxDim * 0.38, maxDim * 0.42));
            _runCameraIntro(fromExt, dest, center);
        } else {
            _cancelCamIntro();
            state.camera.position.copy(dest);
            state.controls.target.copy(center);
            state.controls.update();
            state.defaultCamPos = dest.clone();
            state.defaultTarget = center.clone();
            renderFrame();
        }
    }

    function onResize() {
        var wrap = $('wrap');
        var canvas = $('canvas');
        if (!wrap || !canvas || !state.renderer || !state.camera) return;
        var rect = wrap.getBoundingClientRect();
        var w = Math.max(rect.width || wrap.clientWidth, 320);
        var h = Math.max(rect.height || wrap.clientHeight, 280);
        state.renderer.setSize(w, h, false);
        state.camera.aspect = w / h;
        state.camera.updateProjectionMatrix();
    }

    function renderFrame() {
        if (state.controls) state.controls.update();
        if (state.renderer && state.scene && state.camera) {
            state.renderer.render(state.scene, state.camera);
        }
    }

    function animate() {
        state.animId = requestAnimationFrame(animate);
        renderFrame();
    }

    function pickInstance(ev) {
        var wrap = $('wrap');
        if (!wrap || !state.raycaster || !state.camera || !state.pickables.length) return null;
        var rect = wrap.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        state.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        var hits = state.raycaster.intersectObjects(state.pickables, false);
        for (var h = 0; h < hits.length; h++) {
            var hit = hits[h];
            if (hit.instanceId == null || hit.instanceId < 0) continue;
            var mesh = hit.object;
            for (var i = 0; i < state.slotIndex.length; i++) {
                var rec = state.slotIndex[i];
                if (rec.mesh === mesh && rec.instanceId === hit.instanceId) {
                    return rec;
                }
            }
        }
        return null;
    }

    function onPointerMove(ev) {
        var wrap = $('wrap');
        var tip = $('tooltip');
        var rec = pickInstance(ev);
        if (rec) {
            var slot = rec.slot;
            if (tip && wrap) {
                tip.hidden = false;
                tip.style.left = (ev.clientX - wrap.getBoundingClientRect().left + 12) + 'px';
                tip.style.top = (ev.clientY - wrap.getBoundingClientRect().top + 12) + 'px';
                var bcLong = slot.barcode_longarina || _barcodeLongarina(rec.camara, slot.posicao, slot.nivel);
                var zona = parseInt(slot.nivel, 10) === 1 ? 'PICKING' : 'PULMÃO';
                var extra = slot.destino_label ? (' · ' + slot.destino_label) : (slot.categoria_zona ? (' · Cat ' + slot.categoria_zona) : '');
                tip.innerHTML = '<strong>' + escapeHtml(slot.codigo_endereco) + '</strong><br>'
                    + 'Longarina <strong>' + escapeHtml(bcLong) + '</strong><br>'
                    + 'Câm. ' + rec.camara + ' · Rua ' + escapeHtml(slot.rua)
                    + ' · Pos ' + slot.posicao + ' · Nív ' + slot.nivel + '<br>'
                    + escapeHtml(zona) + ' · ' + escapeHtml(slot.status) + escapeHtml(extra);
            }
            if (wrap) wrap.style.cursor = 'pointer';
        } else {
            if (tip) tip.hidden = true;
            if (wrap) wrap.style.cursor = 'grab';
        }
    }

    function onDblClick(ev) {
        ev.preventDefault();
        var cod = _pickCamaraCodAt(ev) || state.camFilter;
        if (cod) enterChamberView(cod);
    }

    function onClick(ev) {
        var det = $('detalhe');
        var rec = pickInstance(ev);
        if (!rec || !det) {
            if (det) det.hidden = true;
            return;
        }
        var slot = rec.slot;
        var bcLong = slot.barcode_longarina || _barcodeLongarina(rec.camara, slot.posicao, slot.nivel);
        det.hidden = false;
        det.innerHTML = '<strong>' + escapeHtml(slot.codigo_endereco) + '</strong>'
            + ' — Longarina <strong>' + escapeHtml(bcLong) + '</strong><br>'
            + 'Câmara <strong>' + rec.camara + '</strong> · Rua <strong>' + escapeHtml(slot.rua) + '</strong>'
            + ' · Coluna <strong>' + slot.posicao + '</strong> · Nível <strong>' + slot.nivel + '</strong><br>'
            + 'Status: <strong>' + escapeHtml(slot.status) + '</strong>'
            + (slot.categoria_zona ? (' · Categoria zona: <strong>' + escapeHtml(slot.categoria_zona) + '</strong>') : '')
            + (slot.destino_label ? (' · Destino: <strong>' + escapeHtml(slot.destino_label) + '</strong>') : '')
            + (slot.zona_armazenagem ? (' · Zona: ' + escapeHtml(String(slot.zona_armazenagem).toUpperCase())) : '');
    }

    function setLoading(on, msg) {
        var el = $('loading');
        if (!el) return;
        el.hidden = !on;
        if (on && msg) el.textContent = msg;
        else if (!on) el.textContent = 'Carregando mapa 3D…';
    }

    function disposeInternal() {
        _cancelCamIntro();
        if (state.animId) {
            cancelAnimationFrame(state.animId);
            state.animId = null;
        }
        if (state._canvas && state._onPointerMove) {
            state._canvas.removeEventListener('pointermove', state._onPointerMove);
            state._canvas.removeEventListener('click', state._onClick);
            if (state._onDblClick) state._canvas.removeEventListener('dblclick', state._onDblClick);
        }
        if (state.resizeObs) {
            try { state.resizeObs.disconnect(); } catch (e) { /* ignore */ }
            state.resizeObs = null;
        }
        if (state._onWindowResize) {
            global.removeEventListener('resize', state._onWindowResize);
            state._onWindowResize = null;
        }
        _clearStudio();
        _clearInteriorLights();
        if (state.controls) {
            try { state.controls.dispose(); } catch (e) { /* ignore */ }
            state.controls = null;
        }
        clearRack();
        if (state.renderer) {
            try { state.renderer.dispose(); } catch (e) { /* ignore */ }
            state.renderer = null;
        }
        state.scene = null;
        state.camera = null;
        state.rackGroup = null;
        state.camGroups = {};
        state.camFilter = null;
        state._rackMats = null;
        state._sceneLights = null;
        state._canvas = null;
        state.inited = false;
    }

    function waitForLayout(wrap, tries) {
        tries = tries || 0;
        return new Promise(function (resolve, reject) {
            requestAnimationFrame(function () {
                if (!wrap) return reject(new Error('Área do mapa 3D não encontrada'));
                var r = wrap.getBoundingClientRect();
                if (r.width > 40 && r.height > 40) return resolve();
                if (tries >= 40) {
                    return resolve();
                }
                waitForLayout(wrap, tries + 1).then(resolve, reject);
            });
        });
    }

    function initScene(opts) {
        var prefix = (opts && opts.prefix) || state.prefix || 'wms-mapa3d';
        var force = !!(opts && opts.force);
        if (state.inited && (state.prefix !== prefix || force)) {
            disposeInternal();
        }
        state.prefix = prefix;
        if (state.inited) {
            onResize();
            return Promise.resolve();
        }
        return ensureThree().then(function () {
            var THREE = T();
            var canvas = $('canvas');
            var wrap = $('wrap');
            if (!canvas || !wrap) throw new Error('Área do mapa 3D não encontrada (' + state.prefix + ')');

            return waitForLayout(wrap).then(function () {
                state.scene = new THREE.Scene();
                state.scene.background = new THREE.Color(0xf4f6f8);
                state.scene.fog = new THREE.Fog(0xf4f6f8, 55, 320);

                var rect = wrap.getBoundingClientRect();
                var w = Math.max(rect.width || wrap.clientWidth, 320);
                var h = Math.max(rect.height || wrap.clientHeight, 280);
                state.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 400);
                state.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
                state.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
                state.renderer.setSize(w, h, false);
                state.renderer.shadowMap.enabled = true;
                state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

                if (!THREE.OrbitControls) throw new Error('OrbitControls não carregou');
                state.controls = new THREE.OrbitControls(state.camera, canvas);
                state.controls.enableDamping = true;
                state.controls.dampingFactor = 0.08;
                state.controls.maxPolarAngle = Math.PI / 2.05;
                state.controls.minDistance = 1.1;
                state.controls.maxDistance = 220;
                state.controls.enablePan = true;
                state.camera.position.set(-38, 18, 22);
                state.controls.target.set(28, 2.5, 8);
                state.controls.update();

                var ambient = new THREE.AmbientLight(0xffffff, 0.58);
                state.scene.add(ambient);
                var hemi = new THREE.HemisphereLight(0xf0f4ff, 0xcfd8dc, 0.45);
                state.scene.add(hemi);
                var dir = new THREE.DirectionalLight(0xffffff, 0.92);
                dir.position.set(28, 42, 22);
                dir.castShadow = true;
                dir.shadow.mapSize.width = 1024;
                dir.shadow.mapSize.height = 1024;
                dir.shadow.camera.near = 0.5;
                dir.shadow.camera.far = 180;
                dir.shadow.camera.left = -70;
                dir.shadow.camera.right = 70;
                dir.shadow.camera.top = 70;
                dir.shadow.camera.bottom = -70;
                state.scene.add(dir);
                var fill = new THREE.DirectionalLight(0xddeeff, 0.35);
                fill.position.set(-24, 22, -16);
                state.scene.add(fill);
                var rim = new THREE.DirectionalLight(0xffffff, 0.22);
                rim.position.set(0, 16, -32);
                state.scene.add(rim);
                state._sceneLights = {
                    ambient: ambient,
                    hemi: hemi,
                    dir: dir,
                    fill: fill,
                    rim: rim
                };

                state.rackGroup = new THREE.Group();
                state.scene.add(state.rackGroup);

                state.raycaster = new THREE.Raycaster();
                state.mouse = new THREE.Vector2();

                state._canvas = canvas;
                state._onPointerMove = onPointerMove;
                state._onClick = onClick;
                state._onDblClick = onDblClick;
                canvas.addEventListener('pointermove', onPointerMove);
                canvas.addEventListener('click', onClick);
                canvas.addEventListener('dblclick', onDblClick);

                state._onWindowResize = onResize;
                if (typeof ResizeObserver !== 'undefined') {
                    state.resizeObs = new ResizeObserver(onResize);
                    state.resizeObs.observe(wrap);
                }
                global.addEventListener('resize', state._onWindowResize);

                renderLegenda();
                state.inited = true;
                onResize();
                animate();
                renderFrame();
            });
        });
    }

    function setWireframe(on) {
        state.wireframe = !!on;
        if (!state.rackGroup) return;
        state.rackGroup.traverse(function (o) {
            if (o.isInstancedMesh && o.material) o.material.wireframe = state.wireframe;
        });
        renderFrame();
    }

    function resetView() {
        if (!state.camera || !state.controls) return;
        _cancelCamIntro();
        state.interiorMode = false;
        _setExplorationControls(false, null);
        centerCameraOnRack(false, false);
    }

    function _findSlotRecord(camCod, rua, posicao, nivel) {
        var ruaUp = String(rua || '').trim().toUpperCase();
        var pos = parseInt(posicao, 10);
        var niv = parseInt(nivel, 10) || 1;
        for (var i = 0; i < state.slotIndex.length; i++) {
            var rec = state.slotIndex[i];
            var s = rec.slot || {};
            if (parseInt(rec.camara, 10) !== parseInt(camCod, 10)) continue;
            if (String(s.rua || '').trim().toUpperCase() !== ruaUp) continue;
            if ((parseInt(s.posicao, 10) || 0) !== pos) continue;
            if ((parseInt(s.nivel, 10) || 1) !== niv) continue;
            return rec;
        }
        return null;
    }

    function _worldSlotPos(camCod, rua, posicao, nivel) {
        var THREE = T();
        var meta = state.layoutMeta || {};
        var camPos = meta.positions[camCod];
        if (!camPos) return null;
        var ruas = meta.camRuas[camCod] || [];
        var ruaUp = String(rua || '').trim().toUpperCase();
        var ri = 0;
        for (var i = 0; i < ruas.length; i++) {
            if (String(ruas[i]).trim().toUpperCase() === ruaUp) {
                ri = i;
                break;
            }
        }
        var totalRuas = Math.max(ruas.length, 1);
        var xBase = _rackXBaseForCam(camCod, ri, totalRuas);
        var bayStep = SLOT_D + GAP_POS;
        var localZ = (parseInt(posicao, 10) - 1) * bayStep + SLOT_D / 2;
        var y = (parseInt(nivel, 10) - 1) * LEVEL_H + BEAM_H + SHELF_TH * 0.72;
        return new THREE.Vector3(camPos.x + xBase, y, camPos.z + localZ);
    }

    function _buildNavCurve(waypoints) {
        var THREE = T();
        var segLens = [];
        var totalLen = 0;
        for (var i = 0; i < waypoints.length - 1; i++) {
            var len = waypoints[i].distanceTo(waypoints[i + 1]);
            segLens.push(len);
            totalLen += len;
        }
        return {
            getLength: function () { return totalLen; },
            getPoint: function (t) {
                if (t <= 0) return waypoints[0].clone();
                if (t >= 1) return waypoints[waypoints.length - 1].clone();
                var dist = t * totalLen;
                for (var j = 0; j < segLens.length; j++) {
                    if (dist <= segLens[j] || j === segLens.length - 1) {
                        var u = segLens[j] > 0 ? dist / segLens[j] : 0;
                        return waypoints[j].clone().lerp(waypoints[j + 1], u);
                    }
                    dist -= segLens[j];
                }
                return waypoints[waypoints.length - 1].clone();
            },
            getTangent: function (t) {
                var eps = 0.004;
                var a = this.getPoint(Math.max(0, t - eps));
                var b = this.getPoint(Math.min(1, t + eps));
                return b.sub(a).normalize();
            },
            getPoints: function (divisions) {
                var pts = [];
                for (var k = 0; k <= divisions; k++) {
                    pts.push(this.getPoint(k / divisions));
                }
                return pts;
            }
        };
    }

    function _buildNavWaypoints(camCod, rua, posicao, nivel) {
        var THREE = T();
        var meta = state.layoutMeta || {};
        var camPos = meta.positions[camCod];
        var dest = _worldSlotPos(camCod, rua, posicao, nivel);
        if (!camPos || !dest) return [];

        var maxD = meta.maxDepthLeft || 18;
        var corridorZ = meta.corridorMainZ || (maxD + MAIN_AISLE_W / 2);
        var rightX = (meta.rightEdge || 0) + MAIN_AISLE_W * 0.52;
        var entryZ = maxD + 0.28;
        var yFloor = 0.42;
        var aisleX = camPos.x;
        var slotZ = dest.z;
        var pts = [
            new THREE.Vector3(rightX + 3.4, yFloor, corridorZ),
            new THREE.Vector3(rightX, yFloor, corridorZ)
        ];

        if (parseInt(camCod, 10) === 21) {
            pts.push(new THREE.Vector3(aisleX, yFloor, corridorZ));
            var c21Z = meta.corridor21Z || (camPos.z + MAIN_AISLE_W * 0.45);
            pts.push(new THREE.Vector3(aisleX, yFloor, c21Z));
            pts.push(new THREE.Vector3(aisleX, yFloor, camPos.z + 0.45));
        } else {
            pts.push(new THREE.Vector3(aisleX, yFloor, corridorZ));
            pts.push(new THREE.Vector3(aisleX, yFloor, entryZ));
        }

        if (Math.abs((pts[pts.length - 1].z) - slotZ) > 0.6) {
            pts.push(new THREE.Vector3(aisleX, yFloor, slotZ + 2.0));
        }
        pts.push(new THREE.Vector3(aisleX, yFloor, slotZ + 0.85));
        return pts;
    }

    function _restoreHighlight() {
        var prev = state._highlightPrev;
        if (!prev) return;
        var rec = _findSlotRecord(prev.camCod, prev.rua, prev.posicao, prev.nivel);
        if (rec && rec.mesh) {
            var col = new THREE.Color();
            col.setHex(slotColor(rec.slot));
            _setInstanceColor(rec.mesh, rec.instanceId, col);
            if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true;
        }
        state._highlightPrev = null;
    }

    function _highlightSlot(camCod, rua, posicao, nivel) {
        _restoreHighlight();
        var rec = _findSlotRecord(camCod, rua, posicao, nivel);
        if (rec && rec.mesh) {
            var col = new THREE.Color();
            col.setHex(0xe53935);
            _setInstanceColor(rec.mesh, rec.instanceId, col);
            if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true;
            state._highlightPrev = {
                camCod: camCod,
                rua: rua,
                posicao: posicao,
                nivel: nivel
            };
        }
    }

    function _clearNavVisuals() {
        if (state._navAnimId) {
            cancelAnimationFrame(state._navAnimId);
            state._navAnimId = null;
        }
        if (state._navGroup && state.rackGroup) {
            state.rackGroup.remove(state._navGroup);
            state._navGroup.traverse(function (ch) {
                if (ch.geometry) ch.geometry.dispose();
                if (ch.material) {
                    if (Array.isArray(ch.material)) ch.material.forEach(function (m) { m.dispose(); });
                    else ch.material.dispose();
                }
            });
        }
        state._navGroup = null;
    }

    function _clearNavigation() {
        _cancelCamIntro();
        _clearNavVisuals();
        if (state.controls) state.controls.enabled = true;
        _restoreHighlight();
    }

    function _runNavigationPath(waypoints, dest, slotInfo) {
        var THREE = T();
        if (!state.camera || !state.controls || !state.rackGroup || waypoints.length < 2) return;
        _cancelCamIntro();
        _clearNavVisuals();
        state.interiorMode = false;
        _setExplorationControls(false, null);
        if (state.camFilter) {
            state.camFilter = null;
            Object.keys(state.camGroups).forEach(function (cod) {
                var g = state.camGroups[cod];
                if (g) g.visible = true;
            });
        }

        var curve = _buildNavCurve(waypoints);

        var leader = _makeNavArrowMesh(THREE);

        var marker = new THREE.Mesh(
            new THREE.BoxGeometry(SLOT_D * 0.88, SHELF_TH * 2.4, SLOT_D * 0.88),
            new THREE.MeshPhongMaterial({
                color: 0xe53935,
                transparent: true,
                opacity: 0.9,
                emissive: 0x550000
            })
        );
        marker.position.copy(dest);
        marker.visible = false;

        var ring = new THREE.Mesh(
            new THREE.RingGeometry(SLOT_D * 0.35, SLOT_D * 0.58, 28),
            new THREE.MeshBasicMaterial({ color: 0xff1744, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(dest.x, _navArrowFloorY() + 0.004, dest.z);
        ring.visible = false;

        var addrLabel = _makeNavAddrLabel(THREE, slotInfo);
        var labelPos = new THREE.Vector3();

        state._navGroup = new THREE.Group();
        state._navGroup.name = 'nav-path';
        if (addrLabel) state._navGroup.add(addrLabel);
        state._navGroup.add(leader, marker, ring);
        state.rackGroup.add(state._navGroup);

        var aisleX = waypoints[waypoints.length - 1].x;

        var pathLen = curve.getLength();
        var duration = Math.min(4000, Math.max(1800, pathLen * 95));
        var t0 = null;

        var startTan = curve.getTangent(0).normalize();
        _orientNavArrow(leader, waypoints[0].x, waypoints[0].z, startTan.x, startTan.z);

        function _finishNav() {
            var fromPos = state.camera.position.clone();
            var fromTgt = state.controls.target.clone();
            var labelY = dest.y + 1.0;
            /* label colado à face da prateleira, ligeiramente à frente */
            labelPos.set(dest.x, labelY, dest.z + 0.22);
            var toPos = new THREE.Vector3(aisleX, labelY + 0.15, dest.z - 2.8);
            var toTgt = new THREE.Vector3(dest.x, dest.y + 0.5, dest.z);
            var arrowZ = dest.z - 0.9;
            _orientNavArrowToward(leader, aisleX, _navArrowFloorY(), arrowZ, dest.x, dest.y * 0.22, dest.z);
            _animateCameraTo(fromPos, fromTgt, toPos, toTgt, 1100, function () {
                if (addrLabel) {
                    _navLabelFaceCamera(addrLabel, labelPos, state.camera.position);
                    addrLabel.visible = true;
                }
                marker.visible = true;
                ring.visible = true;
                if (slotInfo) {
                    _highlightSlot(slotInfo.camCod, slotInfo.rua, slotInfo.posicao, slotInfo.nivel);
                }
                renderFrame();
            });
        }

        function step(ts) {
            if (!state.camera || !state.controls) return;
            if (!t0) t0 = ts;
            var u = Math.min((ts - t0) / duration, 1);
            u = _smoothNavStep(u);
            var pt = curve.getPoint(u);
            var tangent = curve.getTangent(u).normalize();

            _orientNavArrow(leader, pt.x, pt.z, tangent.x, tangent.z);

            var back = tangent.clone().multiplyScalar(-1);
            var camX = pt.x + back.x * 3.4 - tangent.z * 0.8;
            var camY = Math.max(pt.y, 0.28) + 2.55;
            var camZ = pt.z + back.z * 3.4 + tangent.x * 0.8;
            state.camera.position.set(camX, camY, camZ);
            var lookAhead = curve.getPoint(Math.min(u + 0.04, 1));
            state.controls.target.set(
                lookAhead.x,
                Math.max(lookAhead.y, 0.32) + 0.45,
                lookAhead.z
            );
            state.controls.update();
            renderFrame();

            if (u < 1) {
                state._navAnimId = requestAnimationFrame(step);
            } else {
                _finishNav();
            }
        }
        state._navAnimId = requestAnimationFrame(step);
    }

    function navigateToPosicao(opts) {
        opts = opts || {};
        var camCod = parseInt(opts.camara, 10);
        var rua = String(opts.rua || '').trim().toUpperCase();
        var posicao = parseInt(opts.posicao, 10);
        var nivel = parseInt(opts.nivel, 10) || 1;
        if (!camCod || !rua || !posicao) return;
        if (!state.rackGroup || !state.layoutMeta) return;

        var dest = _worldSlotPos(camCod, rua, posicao, nivel);
        if (!dest) return;

        _restoreHighlight();
        var waypoints = _buildNavWaypoints(camCod, rua, posicao, nivel);
        if (waypoints.length < 2) return;
        _runNavigationPath(waypoints, dest, {
            camCod: camCod,
            rua: rua,
            posicao: posicao,
            nivel: nivel
        });
    }

    global.WmsMapa3d = {
        init: initScene,
        setWireframe: setWireframe,
        resetView: resetView,
        enterChamberView: enterChamberView,
        build: buildRack,
        setCamaraFilter: setCamaraFilter,
        setLoading: setLoading,
        onResize: onResize,
        renderFrame: renderFrame,
        getPrefix: function () { return state.prefix; },
        getBuildStats: function () {
            return {
                inited: !!state.inited,
                racks: state.rackGroup ? state.rackGroup.children.length : 0,
                pickables: state.pickables.length
            };
        },
        dispose: disposeInternal,
        navigateToPosicao: navigateToPosicao,
        clearNavigation: _clearNavigation
    };
    global.__wmsMapa3dReady = true;
})(typeof window !== 'undefined' ? window : globalThis);
