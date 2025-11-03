declare module "../../dist/src/pipeline.js" {
  export function generateComposition(options: any): Promise<any>;
}

declare module "../../dist/src/se/seGenerator.js" {
  export class SEGenerator {
    generateSE(options: any): any;
  }
}
