declare module "imagetracerjs" {
  type AnyObj = Record<string, any>;
  const ImageTracer: {
    imageToSVG: (url: string, options?: AnyObj, callback?: (svg: string) => void) => string | void;
    imagedataToSVG: (imgData: ImageData, options?: AnyObj) => string;
  } & AnyObj;
  export default ImageTracer;
}
