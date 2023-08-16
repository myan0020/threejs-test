
import { Object3D, Vector3, Vector3Tuple } from "three"

// *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** //

export interface Cube {
  id: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  halfLengthX: number;
  halfLengthY: number;
  halfLengthZ: number;
}

export interface Cubes {
  [id: string]: Cube;
}

interface Rect {
  centerX: number;
  centerY: number;
  halfLengthX: number;
  halfLengthY: number;
}

interface Rects {
  [id: string]: Rect;
}

export interface BumpedRect extends Rect {
  id: string;
  hasIntersection?: boolean;
  intersection?: BumpedRect;
}

export interface BumpingRect extends Rect {
  id: string;
}

export interface BumpedRects {
  [id: string]: BumpedRect;
}

export interface PinsWithinRects {
  [rectId: string]: IPins;
}

export interface BumpedPin {
  bumpedId: string;
  distanceFromBumpingToBumped: number;
  pin: IPin;
}

export interface BumpedPinsCoordMap {
  [bumpingLocalX: number]: {
    [bumpingLocalY: number]: BumpedPin;
  }
}

export interface BumpedIdToPins {
  [bumpedId: string]: IPins
}

function createMutableInstanceIdPins(immutableInst: IImmutableInstance, mutableInsts: IInstances, nearestInstsParent: Object3D, ) {
  // from instance to cube
  const immutableInstWorldCube = createWorldCubeFromInstance(immutableInst, nearestInstsParent);
  const mutableInstWorldCubes: Cubes = {};
  for (const [id, mutableInst] of Object.entries(mutableInsts)) {
    mutableInstWorldCubes[id] = createWorldCubeFromInstance(mutableInst, nearestInstsParent);
  }
  // from cube to rect
  const bumpingWorldRect: BumpedRect = createBumpWorldRectFromWorldCube(immutableInstWorldCube);
  const bumpedWorldRects: BumpedRects = {};
  for (const [id, bumpedCube] of Object.entries(mutableInstWorldCubes)) {
    bumpedWorldRects[id] = createBumpWorldRectFromWorldCube(bumpedCube);
  }
  // create substrateId to intersectionRect to filter pins
  const intersectionWorldRects = createIntersectionWorldRects(bumpingWorldRect, bumpedWorldRects);
  // filter any pin that has the same position(X-Z plane) but is farther from any existing pin
  // TODO: 'pinNearestParentObject3D' should be click group object3D
  const bumpedPinsWorldCoordMap = createBumpedPinsWorldCoordMap(immutableInstWorldCube, mutableInstWorldCubes, immutableInst.pins, intersectionWorldRects, pinNearestParentObject3D);
  // create a standard 'IInstance.IPins' data structure container from 'bumpedPinsCoordMap'
  const bumpedIdToWorldPins = createBumpedIdToWorldPinsFromWorldCoordMap(bumpedPinsWorldCoordMap);

  return bumpedIdToWorldPins;
}
function createWorldCubeFromInstance(instance: IImmutableInstance | IInstance, nearestParentObject3D: Object3D): Cube {
  const worldPosition = nearestParentObject3D.localToWorld(new Vector3(...instance.state.position));
  return {
    id: instance.id,
    centerX: worldPosition.x,
    centerY: worldPosition.y,
    centerZ: worldPosition.z,
    halfLengthX: instance.state.scale[0],
    halfLengthY: instance.state.scale[1],
    halfLengthZ: instance.state.scale[2],
  };
}
export function createBumpedIdToWorldPinsFromWorldCoordMap(bumpedPinsWorldCoordMap: BumpedPinsCoordMap) {
  const bumpedIdToPins: BumpedIdToPins = {};

  for (const yToBumpedPinGroup of Object.values(bumpedPinsWorldCoordMap)) {
    for (const bumpedPin of Object.values<BumpedPin>(yToBumpedPinGroup)) {
      if (!bumpedIdToPins[bumpedPin.bumpedId]) {
        bumpedIdToPins[bumpedPin.bumpedId] = { [bumpedPin.pin.id]: bumpedPin.pin };
        continue;
      }
      bumpedIdToPins[bumpedPin.bumpedId][bumpedPin.pin.id] = bumpedPin.pin;
    }
  }

  return bumpedIdToPins;
}
export function createBumpedPinsWorldCoordMap(immutableInstWorldCube: Cube, mutableInstWorldCubes: Cubes, immutableInstPins: IPins, intersectionWorldRects: Rects, nearestParentObject3D: Object3D) {
  const worldCoordMap: BumpedPinsCoordMap = {};

  for (const [rectId, worldRect] of Object.entries(intersectionWorldRects)) {
    const worldRectXFrom = worldRect.centerX - worldRect.halfLengthX;
    const worldRectXTo = worldRect.centerX + worldRect.halfLengthX;
    const worldRectYFrom = worldRect.centerY - worldRect.halfLengthY;
    const worldRectYTo = worldRect.centerY + worldRect.halfLengthY;

    for (const pin of Object.values(immutableInstPins)) {
      // const pinLib = getPinShape(pin.pinLib);
      const pinLib = {
        length: 10,
        width: 10,
        thickness: 10,
      }

      const pinWorldXFrom = nearestParentObject3D.localToWorld(new Vector3(pin.x - pinLib.length / 2, 0, 0)).x;
      const pinWorldXTo = nearestParentObject3D.localToWorld(new Vector3(pin.x + pinLib.length / 2, 0, 0)).x;
      const pinWorldYFrom = nearestParentObject3D.localToWorld(new Vector3(0, pin.y - pinLib.width / 2, 0)).y;
      const pinWorldYTo = nearestParentObject3D.localToWorld(new Vector3(0, pin.y + pinLib.width / 2, 0)).y;

      if (pinWorldXFrom > worldRectXFrom && pinWorldXTo < worldRectXTo && pinWorldYFrom > worldRectYFrom && pinWorldYTo < worldRectYTo) {
        const pinWorldPosition = nearestParentObject3D.localToWorld(new Vector3(pin.x, pin.y, 0))
        const newBumpedWorldPin: BumpedPin = {
          bumpedId: rectId,
          pin: {
            ...pin,
            x: pinWorldPosition.x,
            y: pinWorldPosition.y,
          },
          distanceFromBumpingToBumped: Math.abs(immutableInstWorldCube.centerY - mutableInstWorldCubes[rectId].centerY),
        }

        const mayExistBumpedPin = worldCoordMap[pinWorldPosition.x][pinWorldPosition.y];
        if (mayExistBumpedPin && mayExistBumpedPin.distanceFromBumpingToBumped > newBumpedWorldPin.distanceFromBumpingToBumped) {
          worldCoordMap[pinWorldPosition.x][pinWorldPosition.y] = newBumpedWorldPin;
        }
      }
    }
  }

  return worldCoordMap;
}
function createBumpWorldRectFromWorldCube(worldCube: Cube): BumpedRect | BumpingRect {
  return {
    id: worldCube.id,
    centerX: worldCube.centerX,
    centerY: worldCube.centerY,
    halfLengthX: worldCube.halfLengthX,
    halfLengthY: worldCube.halfLengthZ,
  };
}
export function createIntersectionWorldRects(bumpingWorldRect: BumpingRect, bumpedWorldRects: BumpedRects): Rects {
  const intersectionWorldRects: Rects = {};
  Object.entries(bumpedWorldRects).forEach(([id, bumpedWorldRect]) => {
    const intersectionWorldRect = findIntersection(bumpingWorldRect, bumpedWorldRect);
    if (!intersectionWorldRect) {
      return;
    }
    intersectionWorldRects[id] = intersectionWorldRect;
  });
  return intersectionWorldRects;
}
function findIntersection(bumpingRect: BumpingRect, bumpedRect: BumpedRect): Rect | undefined {
  const bumpingRectFromX = bumpingRect.centerX - bumpingRect.halfLengthX;
  const bumpingRectToX = bumpingRect.centerX + bumpingRect.halfLengthX;
  const bumpedRectFromX = bumpedRect.centerX - bumpedRect.halfLengthX;
  const bumpedRectToX = bumpedRect.centerX + bumpedRect.halfLengthX;

  const bumpingRectFromY = bumpingRect.centerY - bumpingRect.halfLengthY;
  const bumpingRectToY = bumpingRect.centerY + bumpingRect.halfLengthY;
  const bumpedRectFromY = bumpedRect.centerY - bumpedRect.halfLengthY;
  const bumpedRectToY = bumpedRect.centerY + bumpedRect.halfLengthY;

  if (
    bumpingRectToX <= bumpedRectFromX ||
    bumpedRectToX <= bumpingRectFromX ||
    bumpingRectToY <= bumpedRectFromY ||
    bumpedRectToY <= bumpingRectFromY
  ) {
    return;
  }

  const intersectionFromX = Math.max(bumpingRectFromX, bumpedRectFromX);
  const intersectionToX = Math.min(bumpingRectToX, bumpedRectToX);
  const intersectionFromY = Math.max(bumpingRectFromY, bumpedRectFromY);
  const intersectionToY = Math.min(bumpingRectToY, bumpedRectToY);

  return {
    centerX: (intersectionFromX + intersectionToX) / 2,
    centerY: (intersectionFromY + intersectionToY) / 2,
    halfLengthX: (intersectionToX - intersectionFromX) / 2,
    halfLengthY: (intersectionToY - intersectionFromY) / 2,
  };
}

function localToLocal(fromVector: Vector3, fromLocalObject3D: Object3D, toLocalObject3D: Object3D) {
  const fromWorldVector = fromLocalObject3D.localToWorld(fromVector);
  return toLocalObject3D.worldToLocal(fromWorldVector);
}

// *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** // ** // *** //


export interface IInstances {
  [id: string]: IInstance | IImmutableInstance
}

export interface IInstanceState {
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple // size
  visible: boolean
  transparent: boolean
  opacity: number
  bodyColor: string
}

export type InstanceType = "Substrate" | "Interposer"
export type ImmutableInstanceType = "Chiplet" | "Capacitor"

export interface IImmutableInstance {
  id: string
  type: ImmutableInstanceType
  state: IInstanceState
  pins: IPins
  pinNets: IPinNets
  libName: string
  instName?: string
}

export interface IInstance {
  id: string
  type: InstanceType
  state: IInstanceState
  pins: IPins
  pinNets: IPinNets
  libName: string
  instName?: string
}

export interface IPinNets {
  [id: string]: IPinNet
}

export interface IPinNet {
  id: string
  net: string // 未分配网络为NC
}

export type ISide = 1 | -1

export enum PinGenType {
  Auto,
  Bump,
  Manual,
}

export interface IPins {
  [id: string]: IPin
}

// type IPinTest = [string, number, number, ISide, string, 0 | 1 | 2];

// 引脚物理信息
export interface IPin {
  id: string
  x: number
  y: number
  side: ISide // 正面为1 反面为-1
  pinLib: string // 未分配为空字符串
  generated: PinGenType // 是否是自动生成的，0 表示非自动生成的（固有的），1 表示bump映射 2 表示手动生成ball
}

export interface INets {
  [name: string]: INet
}

export interface INet {
  name: string
  diff: string
  category: string
  group: string
  visible: boolean
  color: string
}

