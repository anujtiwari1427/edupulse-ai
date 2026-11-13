import * as THREE from 'three';
import type { StudioPartId } from './types';

function tagPart(group: THREE.Object3D, partId: StudioPartId) {
  group.userData.partId = partId;
  group.traverse((child) => {
    child.userData.partId = partId;
  });
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  s.moveTo(x + radius, y);
  s.lineTo(x + width - radius, y);
  s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius);
  s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius);
  s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}

export interface StudioSceneAssemblies {
  root: THREE.Group;
  plinthGroup: THREE.Group;
  deskMatMesh: THREE.Mesh;
  textbookGroup: THREE.Group;
  primaryCoverMat: THREE.MeshStandardMaterial;
  blueprintGroup: THREE.Group;
  blueprintPlateMat: THREE.MeshStandardMaterial;
  blueprintGlassMat: THREE.MeshPhysicalMaterial;
  paperSetsGroup: THREE.Group;
  sheetA: THREE.Group;
  sheetB: THREE.Group;
  sheetC: THREE.Group;
  sheetAMat: THREE.MeshStandardMaterial;
  sheetBMat: THREE.MeshStandardMaterial;
  sheetCMat: THREE.MeshStandardMaterial;
  sealGroup: THREE.Group;
  rubricGroup: THREE.Group;
  rubricCardMat: THREE.MeshStandardMaterial;
  interactables: THREE.Object3D[];
}

export interface BuildSceneMaterialsInput {
  isDark: boolean;
  isSoftwareGl: boolean;
  deskMatTex: THREE.Texture;
  clothNoiseTex: THREE.Texture;
  primaryBookTex: THREE.Texture;
  companionBookTex: THREE.Texture;
  pageEdgesTex: THREE.Texture;
  blueprintPlateTex: THREE.Texture;
  paperTexA: THREE.Texture;
  paperTexB: THREE.Texture;
  paperTexC: THREE.Texture;
  rubricCardTex: THREE.Texture;
}

export function buildStudioAssemblies(input: BuildSceneMaterialsInput): StudioSceneAssemblies {
  const root = new THREE.Group();

  // Shared calibrated PBR materials (roughness delta >= 0.25 across assemblies)
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a446,
    metalness: 0.88,
    roughness: 0.26,
  });

  const anodizedAlumMat = new THREE.MeshStandardMaterial({
    color: input.isDark ? 0x334155 : 0x475569,
    metalness: 0.78,
    roughness: 0.34,
  });

  const stonePlinthMat = new THREE.MeshStandardMaterial({
    color: input.isDark ? 0x181c26 : 0xdad5cc,
    metalness: 0.04,
    roughness: 0.86,
  });

  // 1. PLINTH & ARCHITECTURAL DRAFTING DESK (6 parts + 24 InstancedMesh calibration pins)
  const plinthGroup = new THREE.Group();

  const plinthShape = createRoundedRectShape(6.8, 4.7, 0.24);
  const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  plinthGeo.rotateX(Math.PI / 2);
  const plinthBase = new THREE.Mesh(plinthGeo, stonePlinthMat);
  plinthBase.position.y = 0.0;
  plinthBase.receiveShadow = true;
  plinthBase.castShadow = true;
  plinthGroup.add(plinthBase);

  const deskMatGeo = new THREE.BoxGeometry(6.25, 0.025, 4.18);
  const deskMatMaterial = new THREE.MeshStandardMaterial({
    map: input.deskMatTex,
    roughness: 0.82,
    metalness: 0.04,
  });
  const deskMatMesh = new THREE.Mesh(deskMatGeo, deskMatMaterial);
  deskMatMesh.position.set(0, 0.038, 0);
  deskMatMesh.receiveShadow = true;
  plinthGroup.add(deskMatMesh);

  // Brass corner L-brackets / side rails
  const railGeo = new THREE.BoxGeometry(6.32, 0.035, 0.045);
  const frontRail = new THREE.Mesh(railGeo, brassMat);
  frontRail.position.set(0, 0.04, 2.12);
  frontRail.castShadow = true;
  plinthGroup.add(frontRail);

  const backRail = new THREE.Mesh(railGeo, brassMat);
  backRail.position.set(0, 0.04, -2.12);
  backRail.castShadow = true;
  plinthGroup.add(backRail);

  // Instanced brass index pins along the front & back studio rails (>20 instances -> InstancedMesh)
  const pinGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.03, 12);
  const pinCount = 24;
  const pins = new THREE.InstancedMesh(pinGeo, brassMat, pinCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < pinCount; i++) {
    const row = i < 12 ? -1 : 1;
    const col = i % 12;
    dummy.position.set(-2.75 + col * 0.5, 0.06, row * 2.12);
    dummy.updateMatrix();
    pins.setMatrixAt(i, dummy.matrix);
  }
  pins.instanceMatrix.needsUpdate = true;
  pins.computeBoundingSphere();
  plinthGroup.add(pins);

  // Brass triangular architect's scale ruler along front-left edge of studio mat
  const scaleRuler = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 2.2, 3), brassMat);
  scaleRuler.rotation.set(0, 0.08, Math.PI / 2);
  scaleRuler.position.set(-0.25, 0.075, 1.62);
  scaleRuler.castShadow = true;
  plinthGroup.add(scaleRuler);

  // Soft studio floor receiver plane for shadows
  const floorPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.ShadowMaterial({ opacity: input.isDark ? 0.35 : 0.14 })
  );
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.y = -0.19;
  floorPlane.receiveShadow = true;
  plinthGroup.add(floorPlane);

  root.add(plinthGroup);

  // 2. HARDCOVER TEXTBOOK STACK (7 parts: companion book, main cover boards, curved spine, page block, bookmark ribbon, foil clasp)
  const textbookGroup = new THREE.Group();
  textbookGroup.position.set(-1.62, 0.055, 0.25);

  // Companion bottom textbook (angled slightly for natural desk feel)
  const companionGroup = new THREE.Group();
  companionGroup.rotation.y = 0.14;
  const compCoverGeo = new THREE.BoxGeometry(1.56, 0.19, 2.08);
  const compCoverMat = new THREE.MeshStandardMaterial({
    map: input.companionBookTex,
    roughnessMap: input.clothNoiseTex,
    roughness: 0.78,
    metalness: 0.06,
  });
  const compPagesMat = new THREE.MeshStandardMaterial({
    map: input.pageEdgesTex,
    roughness: 0.9,
    metalness: 0.0,
  });
  const compBook = new THREE.Mesh(compCoverGeo, [
    compPagesMat,
    compCoverMat,
    compCoverMat,
    compCoverMat,
    compPagesMat,
    compPagesMat,
  ]);
  compBook.position.y = 0.095;
  compBook.castShadow = true;
  compBook.receiveShadow = true;
  companionGroup.add(compBook);
  textbookGroup.add(companionGroup);

  // Main hero textbook (beveled front & back covers + spine + page block + silk bookmark)
  const mainBook = new THREE.Group();
  mainBook.position.set(0.06, 0.2, -0.04);
  mainBook.rotation.y = -0.08;

  const boardShape = createRoundedRectShape(1.52, 2.02, 0.05);
  const boardGeo = new THREE.ExtrudeGeometry(boardShape, {
    depth: 0.025,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  boardGeo.rotateX(-Math.PI / 2);

  const primaryClothMat = new THREE.MeshStandardMaterial({
    color: 0x242066,
    roughnessMap: input.clothNoiseTex,
    roughness: 0.78,
    metalness: 0.08,
  });

  const primaryCoverMat = new THREE.MeshStandardMaterial({
    map: input.primaryBookTex,
    roughnessMap: input.clothNoiseTex,
    roughness: 0.68,
    metalness: 0.08,
  });

  const backBoard = new THREE.Mesh(boardGeo, primaryClothMat);
  backBoard.position.y = 0.008;
  backBoard.castShadow = true;
  backBoard.receiveShadow = true;
  mainBook.add(backBoard);

  const pageBlockGeo = new THREE.BoxGeometry(1.42, 0.21, 1.92);
  const pageBlockMat = new THREE.MeshStandardMaterial({
    map: input.pageEdgesTex,
    roughness: 0.92,
    metalness: 0.0,
  });
  const pageBlock = new THREE.Mesh(pageBlockGeo, pageBlockMat);
  pageBlock.position.set(0.02, 0.135, 0);
  pageBlock.castShadow = true;
  pageBlock.receiveShadow = true;
  mainBook.add(pageBlock);

  const frontBoard = new THREE.Mesh(boardGeo, primaryClothMat);
  frontBoard.position.y = 0.245;
  frontBoard.castShadow = true;
  frontBoard.receiveShadow = true;
  mainBook.add(frontBoard);

  // Crisp 0..1 UV-mapped top cover face inset on top of frontBoard
  const coverTopPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 1.98), primaryCoverMat);
  coverTopPlane.rotation.x = -Math.PI / 2;
  coverTopPlane.position.set(0, 0.279, 0);
  coverTopPlane.receiveShadow = true;
  mainBook.add(coverTopPlane);

  // Rounded book spine (half-cylinder shell along -X edge)
  const spineGeo = new THREE.CylinderGeometry(
    0.142,
    0.142,
    2.03,
    18,
    1,
    false,
    Math.PI * 0.5,
    Math.PI
  );
  spineGeo.rotateX(Math.PI / 2);
  const spineMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b4b,
    roughness: 0.68,
    metalness: 0.12,
  });
  const spineMesh = new THREE.Mesh(spineGeo, spineMat);
  spineMesh.position.set(-0.74, 0.14, 0);
  spineMesh.castShadow = true;
  mainBook.add(spineMesh);

  // Gold spine bands (2 rings)
  for (const bandZ of [-0.66, 0.66]) {
    const bandGeo = new THREE.CylinderGeometry(0.146, 0.146, 0.04, 18, 1, true, Math.PI * 0.5, Math.PI);
    bandGeo.rotateX(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, brassMat);
    band.position.set(-0.74, 0.14, bandZ);
    mainBook.add(band);
  }

  // Woven silk bookmark ribbon curving smoothly out the bottom edge
  const ribbonCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.24, 0.135, 0.5),
    new THREE.Vector3(0.26, 0.13, 0.96),
    new THREE.Vector3(0.28, 0.075, 1.12),
    new THREE.Vector3(0.32, 0.02, 1.28),
  ]);
  const ribbonGeo = new THREE.TubeGeometry(ribbonCurve, 20, 0.018, 6, false);
  ribbonGeo.scale(1.8, 0.35, 1);
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.52,
    metalness: 0.05,
  });
  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.castShadow = true;
  mainBook.add(ribbonMesh);

  textbookGroup.add(mainBook);
  tagPart(textbookGroup, 'textbook');
  root.add(textbookGroup);

  // 3. BLUEPRINT CALIBRATION PRISM & MATRIX PLATE (5 parts: machined aluminum frame, glass plate, blueprint matrix plane, 4 brass corner screws)
  const blueprintGroup = new THREE.Group();
  blueprintGroup.position.set(-0.15, 1.24, -0.35);
  blueprintGroup.rotation.set(-0.24, 0.08, 0);

  // Outer perimeter frame using Shape + hole
  const outerFrame = createRoundedRectShape(2.36, 1.58, 0.08);
  const innerCutout = createRoundedRectShape(2.14, 1.36, 0.04);
  outerFrame.holes.push(innerCutout);
  const frameGeo = new THREE.ExtrudeGeometry(outerFrame, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  frameGeo.center();
  const frameMesh = new THREE.Mesh(frameGeo, anodizedAlumMat);
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  blueprintGroup.add(frameMesh);

  // Corner brass hex bolts (4 bolts)
  const boltGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.08, 6);
  boltGeo.rotateX(Math.PI / 2);
  const corners: ReadonlyArray<readonly [number, number]> = [
    [-1.1, 0.71],
    [1.1, 0.71],
    [-1.1, -0.71],
    [1.1, -0.71],
  ];
  for (const [bx, by] of corners) {
    const bolt = new THREE.Mesh(boltGeo, brassMat);
    bolt.position.set(bx, by, 0);
    blueprintGroup.add(bolt);
  }

  // Printed Blueprint Matrix Core Card inside frame
  const blueprintPlateMat = new THREE.MeshStandardMaterial({
    map: input.blueprintPlateTex,
    roughness: 0.42,
    metalness: 0.05,
    emissive: new THREE.Color(0x4338ca),
    emissiveIntensity: input.isDark ? 0.14 : 0.04,
  });
  const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.12, 1.34, 0.012), blueprintPlateMat);
  plateMesh.position.z = -0.008;
  blueprintGroup.add(plateMesh);

  // Protective optical glass lens in front of matrix
  const blueprintGlassMat = new THREE.MeshPhysicalMaterial({
    color: input.isDark ? 0xc7d2fe : 0xffffff,
    metalness: 0.0,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transmission: input.isSoftwareGl ? 0 : 0.78,
    thickness: 0.16,
    ior: 1.48,
    transparent: true,
    opacity: input.isSoftwareGl ? 0.08 : 0.92,
  });
  const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(2.14, 1.36, 0.018), blueprintGlassMat);
  glassMesh.position.z = 0.018;
  blueprintGroup.add(glassMesh);

  tagPart(blueprintGroup, 'blueprint');
  root.add(blueprintGroup);

  // 4. FANNED A4 QUESTION PAPER SETS A / B / C + FOUNTAIN PEN (8 parts)
  const paperSetsGroup = new THREE.Group();
  paperSetsGroup.position.set(1.25, 0.08, 0.22);

  function createCurvedSheet(mat: THREE.MeshStandardMaterial): THREE.Group {
    const g = new THREE.Group();
    const geom = new THREE.PlaneGeometry(1.48, 2.06, 1, 18);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.getAttribute('position');
    if (pos instanceof THREE.BufferAttribute) {
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        // Gentle physical paper curl near bottom-right corner
        const curl = Math.pow(Math.max(0, (z + 1.03) / 2.06), 2.1) * 0.055;
        pos.setY(i, pos.getY(i) + curl);
      }
    }
    geom.computeVertexNormals();
    const sheetMesh = new THREE.Mesh(geom, mat);
    sheetMesh.castShadow = true;
    sheetMesh.receiveShadow = true;
    g.add(sheetMesh);
    return g;
  }

  const sheetAMat = new THREE.MeshStandardMaterial({
    map: input.paperTexA,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const sheetBMat = new THREE.MeshStandardMaterial({
    map: input.paperTexB,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const sheetCMat = new THREE.MeshStandardMaterial({
    map: input.paperTexC,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const sheetC = createCurvedSheet(sheetCMat);
  sheetC.position.set(0.18, 0.01, -0.05);
  sheetC.rotation.y = -0.22;

  const sheetB = createCurvedSheet(sheetBMat);
  sheetB.position.set(0.08, 0.05, 0.0);
  sheetB.rotation.y = -0.08;

  const sheetA = createCurvedSheet(sheetAMat);
  sheetA.position.set(-0.04, 0.095, 0.05);
  sheetA.rotation.y = 0.08;

  paperSetsGroup.add(sheetC, sheetB, sheetA);

  // Brass corner binder clip on Set A top edge
  const clipBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.07), anodizedAlumMat);
  clipBody.position.set(-0.48, 0.125, -0.9);
  clipBody.rotation.y = 0.08;
  clipBody.castShadow = true;
  paperSetsGroup.add(clipBody);

  const clipWire = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 20), brassMat);
  clipWire.position.set(-0.48, 0.155, -0.94);
  clipWire.rotation.set(Math.PI / 3, 0.08, 0);
  paperSetsGroup.add(clipWire);

  // Turned Fountain Pen resting beside papers (LatheGeometry barrel + brass ring + tapered nib)
  const penGroup = new THREE.Group();
  penGroup.position.set(0.95, 0.045, 0.38);
  penGroup.rotation.set(0, 0.34, Math.PI / 2);

  const penProfile = [
    new THREE.Vector2(0.0, -0.58),
    new THREE.Vector2(0.022, -0.56),
    new THREE.Vector2(0.042, -0.35),
    new THREE.Vector2(0.046, 0.18),
    new THREE.Vector2(0.036, 0.24),
    new THREE.Vector2(0.028, 0.42),
    new THREE.Vector2(0.004, 0.56),
    new THREE.Vector2(0.0, 0.57),
  ];
  const penBarrelGeo = new THREE.LatheGeometry(penProfile, 24);
  const penBarrelMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e1b4b,
    roughness: 0.18,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });
  const penBarrel = new THREE.Mesh(penBarrelGeo, penBarrelMat);
  penBarrel.castShadow = true;
  penGroup.add(penBarrel);

  const penRing = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.035, 24), brassMat);
  penRing.position.y = 0.19;
  penGroup.add(penRing);

  const penNib = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.15, 16), brassMat);
  penNib.position.y = 0.52;
  penGroup.add(penNib);

  paperSetsGroup.add(penGroup);
  tagPart(paperSetsGroup, 'sets');
  root.add(paperSetsGroup);

  // 5. LOCAL-FIRST WAX & BRASS EXAMINATION SEAL (4 parts: Lathe hardwood handle, brass ferrule, octagonal die, embossed wax seal)
  const sealGroup = new THREE.Group();
  sealGroup.position.set(-2.35, 0.055, 1.38);

  const sealHandleProfile = [
    new THREE.Vector2(0.0, 0.06),
    new THREE.Vector2(0.09, 0.06),
    new THREE.Vector2(0.065, 0.14),
    new THREE.Vector2(0.055, 0.24),
    new THREE.Vector2(0.115, 0.42),
    new THREE.Vector2(0.105, 0.54),
    new THREE.Vector2(0.045, 0.62),
    new THREE.Vector2(0.0, 0.64),
  ];
  const sealHandleMat = new THREE.MeshStandardMaterial({
    color: 0x5c2d16,
    roughness: 0.36,
    metalness: 0.04,
  });
  const sealHandle = new THREE.Mesh(new THREE.LatheGeometry(sealHandleProfile, 24), sealHandleMat);
  sealHandle.castShadow = true;
  sealGroup.add(sealHandle);

  const sealBrassDie = new THREE.Mesh(
    new THREE.CylinderGeometry(0.135, 0.145, 0.07, 8),
    brassMat
  );
  sealBrassDie.position.y = 0.035;
  sealBrassDie.castShadow = true;
  sealGroup.add(sealBrassDie);

  const waxMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.42,
    metalness: 0.06,
  });
  const waxDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.024, 24), waxMat);
  waxDisk.position.set(0.36, 0.012, 0.1);
  waxDisk.castShadow = true;
  waxDisk.receiveShadow = true;
  sealGroup.add(waxDisk);

  const waxRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 10, 28), waxMat);
  waxRim.rotation.x = Math.PI / 2;
  waxRim.position.set(0.36, 0.026, 0.1);
  sealGroup.add(waxRim);

  tagPart(sealGroup, 'seal');
  root.add(sealGroup);

  // 6. MARKING SCHEME RUBRIC STAND & ARCHITECTURAL SCALE RULER (4 parts)
  const rubricGroup = new THREE.Group();
  rubricGroup.position.set(1.72, 0.055, -1.28);
  rubricGroup.rotation.y = -0.36;

  const easelBase = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.04, 0.48), anodizedAlumMat);
  easelBase.position.y = 0.02;
  easelBase.castShadow = true;
  easelBase.receiveShadow = true;
  rubricGroup.add(easelBase);

  const rubricCardMat = new THREE.MeshStandardMaterial({
    map: input.rubricCardTex,
    roughness: 0.46,
    metalness: 0.04,
  });
  const rubricCard = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.92, 0.026), rubricCardMat);
  rubricCard.position.set(0, 0.48, -0.02);
  rubricCard.rotation.x = -0.22;
  rubricCard.castShadow = true;
  rubricGroup.add(rubricCard);

  tagPart(rubricGroup, 'rubric');
  root.add(rubricGroup);

  return {
    root,
    plinthGroup,
    deskMatMesh,
    textbookGroup,
    primaryCoverMat,
    blueprintGroup,
    blueprintPlateMat,
    blueprintGlassMat,
    paperSetsGroup,
    sheetA,
    sheetB,
    sheetC,
    sheetAMat,
    sheetBMat,
    sheetCMat,
    sealGroup,
    rubricGroup,
    rubricCardMat,
    interactables: [textbookGroup, blueprintGroup, paperSetsGroup, sealGroup, rubricGroup],
  };
}
