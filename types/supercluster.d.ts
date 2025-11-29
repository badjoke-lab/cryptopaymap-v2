declare module "supercluster" {
  import type { Feature, Point } from "geojson";

  export type BBox = [number, number, number, number];

  export interface Options<P = any, C = any> {
    minZoom?: number;
    maxZoom?: number;
    minPoints?: number;
    radius?: number;
    extent?: number;
    nodeSize?: number;
    log?: boolean;
    map?(properties: P): C;
    reduce?(accumulated: C, properties: P): void;
    initial?(): C;
  }

  export type ClusterProperties<C = any> = C & {
    cluster: true;
    cluster_id: number;
    point_count: number;
    point_count_abbreviated?: number;
  };

  export default class Supercluster<P = any, C = any> {
    constructor(options?: Options<P, C>);
    load(points: Array<Feature<Point, P>>): this;
    getClusters(
      bbox: BBox,
      zoom: number,
    ): Array<Feature<Point, P | ClusterProperties<C>>>;
    getClusterExpansionZoom(clusterId: number): number;
    getLeaves(
      clusterId: number,
      limit?: number,
      offset?: number,
    ): Array<Feature<Point, P>>;
    getChildren(
      clusterId: number,
      offset?: number,
    ): Array<Feature<Point, P | ClusterProperties<C>>>;
    getTile(
      zoom: number,
      x: number,
      y: number,
    ): { features: Array<Feature<Point, P | ClusterProperties<C>>> } | null;
  }
}
