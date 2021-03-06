import React, {useState, useEffect, useRef} from 'react';
import ice from './ice.jpg'
import './App.css';
import * as cocoSsd from '@tensorflow-models/coco-ssd';


function App() {
  const [i, setI] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [colors, setColors] = useState([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const screenRef = useRef(null);

  useEffect(() => {
    console.log('setting up camera...');
    setupWebcam(videoRef.current).then(() => {
      setIsCameraReady(true)
      console.log('  camera is ready.')
    });
  }, [videoRef]);

  useEffect(() => {
    var abort = false;
    const ctx = canvasRef.current.getContext('2d');
    function tick() {
      ctx.drawImage(videoRef.current, 0, 0, 400*3/4, 300/2); // no idea what this transform is from...
      greenify(canvasRef.current, ctx, colors);
      if (!abort) requestAnimationFrame(tick);
    }
    console.log('first tick...');
    tick();
    return () => abort = true;
  }, [videoRef, isCameraReady, colors]);

  const predictions = useCoco(canvasRef.current, isCameraReady);

  return (
    <div className="App">
      <div style={{display: 'flex'}}>
        <div style={{position: 'relative', width: 400, height: 300}}>
          <video
            style={{position: 'absolute', opacity: 0}}
            key="video"
            onClick={e => {
              console.log('e', e, e.clientX, e.clientY);
              const ctx = canvasRef.current.getContext('2d');
              const c = ctx.getImageData(e.clientX, e.clientY, 1, 1).data;
              console.log('c', c);
            }}
            ref={videoRef}
            autoPlay 
            playsInline
            muted
            width="400"
            height="300"
          ></video>
          <img alt="ice" src={`https://picsum.photos/400/300?${i}`} style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 400,
            height: 300
          }} />
          <canvas
            ref={canvasRef}
            onClick={e => {
              const canvas = canvasRef.current;
              const rect = canvas.getBoundingClientRect();
              const {x,y} = {
                x: (e.clientX - rect.left) / (rect.right - rect.left) * canvas.width,
                y: (e.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height
              };
              console.log('e', e);
              const ctx = canvas.getContext('2d');
              const d = ctx.getImageData(x, y, 1, 1);

              const color = d.data;
              setColors(colors.concat(color)); // TODO(kr) unique these

              // const out = screenRef.current.getContext('2d');
              // out.fillStyle = rgbaify(color);
              // out.fillRect(x, y, 10, 10);
              // console.log('colors.concat(color)', colors.concat(color));

              // console.log('x,y', x, y);
              // out.putImageData(d, x, y);
              // console.log('out', out, d, x, y);
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 400,
              height: 300
            }}
          ></canvas>
        </div>
        <canvas
          ref={screenRef}
          style={{
            width: 400,
            height: 300
          }}
        ></canvas>
      </div>
      <div style={{minHeight: 100}}>{colors.map(color => (
        <div key={rgbaify(color)} style={{display: 'inline-block', fontSize: 14, width: 64, height: 64, background: rgbaify(color)}}>
          {color.join("\n")}
        </div>
      ))}</div>
      <button onClick={() => setColors([])}>reset</button>
      <button onClick={() => setI(i + 1)}>background</button>
      <div>{(predictions || []).map(prediction => (
        <div key={[prediction.class, prediction.score].join(':')}>{prediction.score.toFixed(3)} for {prediction.class}</div>
      ))}</div>
    </div>
  );
}


export default App;


async function setupWebcam(el) {
  return new Promise((resolve, reject) => {
    const navigatorAny = navigator;
    navigator.getUserMedia = navigator.getUserMedia ||
        navigatorAny.webkitGetUserMedia || navigatorAny.mozGetUserMedia ||
        navigatorAny.msGetUserMedia;
    if (navigator.getUserMedia) {
      navigator.getUserMedia({video: true},
        stream => {
          el.srcObject = stream;
          el.addEventListener('loadeddata',  () => resolve(), false);
        },
        error => reject());
    } else {
      reject();
    }
  });
}

function greenify(canvas, ctx, colors) {
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let l = frame.data.length / 4;

  // console.log('frame.data', frame.data);
  for (let i = 0; i < l; i++) {
    let r = frame.data[i * 4 + 0];
    let g = frame.data[i * 4 + 1];
    let b = frame.data[i * 4 + 2];
    if (matchesAny(r, g, b, colors)) {
      // console.log('matches!')
      // frame.data[i * 4 + 0] = 0;
      // frame.data[i * 4 + 1] = 0;
      // frame.data[i * 4 + 2] = 0;
      frame.data[i * 4 + 3] = 0;
    }
    // if (i % 10 === 0) {
    //   console.log('i', i, r, g, b);
    // }
  }
  ctx.putImageData(frame, 0, 0);
}

function rgbaify(quad) {
  return `rgba(${quad[0]},${quad[1]},${quad[2]},${quad[3]})`;
}

function matchesAny(r, g, b, colors) {
  // const matches = colors.filter(c => {
  //   return (chroma.deltaE(chroma(c[0], c[1], c[2]), chroma(r, g, b)) < 10);
  // });
  // return (matches.length > 0);

  // return Math.random() > 0.5;
  // return (colors.filter(c => c[0] === r && c[1] === g && c[2] === b).length > 0);

  return (colors.filter(c => (
    Math.abs(c[0] - r) < 5 &&
    Math.abs(c[1] - g) < 5 &&
    Math.abs(c[2] - b) < 5
  )).length > 0);

}

// load coco and predict
function useCoco(canvas, isReady) {
  const [coco, setCoco] = useState(null);
  const [predictions, setPredictions] = useState([]);

  useEffect(() => {
    if (!isReady) return;
    console.log('loading coco...');
    cocoSsd.load().then(model => setCoco(model));
  }, [isReady]);

  useEffect(() => {
    if (!coco) return;
    var abort = false;
    function predict() {
      console.log('predicting...');
      coco.detect(canvas).then(predictions => {
        setPredictions(predictions);
        console.log('  predicted.');
        if (!abort) setTimeout(predict, 5000);
      });
    }
    predict();
    return () => abort = true;
  }, [coco, isReady, canvas]);

  return predictions;
}