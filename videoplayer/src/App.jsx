import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import VideoPlayer from './components/VideoPlayer'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
     <VideoPlayer videoId={1735656368338}/>
    </>
  )
}

export default App
