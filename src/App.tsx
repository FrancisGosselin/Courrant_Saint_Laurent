import WorldMapWindGL from './components/WorldMap_WindGL'
import './App.css'

function App() {
  return (
    <div className="App">
      <header style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'white', padding: '10px', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h1 style={{ margin: 0, fontSize: '1.5em' }}>World Map Navigator</h1>
        <p style={{ margin: '5px 0 0 0', fontSize: '0.9em', color: '#666' }}>Click on markers to explore locations</p>
      </header>
      <WorldMapWindGL />
    </div>
  )
}

export default App
