import React, { Component } from 'react'
import L from 'leaflet'
import {Tag, Input, Tooltip, Icon} from 'antd'

import 'leaflet/dist/leaflet.css'
import 'antd/dist/antd.css'

// store the map configuration properties in an object,
// we could also move this to a separate file & import it if desired.
const config = {
  params: {
    center: [0.0,0.0],
    zoomControl: false,
    zoom: 2,
    maxZoom: 5,
    minZoom: 0,
    scrollwheel: false,
    legends: true,
    infoControl: false,
    attributionControl: true
  },
  tileLayer: {
    uri: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    params: {
      minZoom: 0,
      subdomains: 'abcdefghijk',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>',
      id: '',
      accessToken: ''
    }
  }
};

class Map extends Component {
  constructor(props) {
    super(props)
    this.state = {
      map: null,
      tileLayer: null,
      geojsonLayer: null,
      geojson: null,
      people: [],
      foafuris: [
        "http://3roundstones.com/dave/me.rdf",
        "https://w3id.org/people/bsletten"
      ],
      inputVisible: false,
      inputValue: ''
    }
    this._mapNode = null
    this.onEachFeature = this.onEachFeature.bind(this)
    this.handleTagInputChange = this.handleTagInputChange.bind(this)
    this.handleTagInputConfirm = this.handleTagInputConfirm.bind(this)
    this.showInput = this.showInput.bind(this)
  }

  componentDidMount() {
    // create the Leaflet map object
    if (!this.state.map) this.init(this._mapNode);
    // code to run just after the component "mounts" / DOM elements are created
    this.getData()
  }

  componentDidUpdate(prevProps, prevState) {
    // code to run when the component receives new props or state
    // check to see if geojson is stored, map is created, and geojson overlay needs to be added
    if (this.state.geojson && this.state.map && prevState.geojson !== this.state.geojson) {
      // this.removeGeoJSONLayer()
      this.addGeoJSONLayer(this.state.geojson)
    }
  }

  componentWillUnmount() {
    // code to run just before unmounting the component
    // this destroys the Leaflet map object & related event listeners
    this.state.map.remove()
  }

  handleTagInputChange(e) {
    this.setState({ inputValue: e.target.value })
  }

  handleTagClose(removedUri) {
    const foafuris = this.state.foafuris.filter(uri => uri !== removedUri)
    this.setState({foafuris}, this.getData)
  }

  showInput() {
    this.setState({ inputVisible: true }, () => this.input.focus())
  }

  handleTagInputConfirm() {
    const { inputValue } = this.state
    let { foafuris } = this.state
    if (inputValue && foafuris.indexOf(inputValue) === -1) {
      foafuris = [...foafuris, inputValue]
    }
    this.setState({
      foafuris,
      inputVisible: false,
      inputValue: ''
    }, this.getData)
  }

  saveInputRef = input => this.input = input

  getData() {
    this.removeGeoJSONLayer()
    const query = `
      prefix foaf: <http://xmlns.com/foaf/0.1/>
      prefix geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>

      select distinct ?name ?latitude ?longitude
      where {
        ?person foaf:name ?name ;
                foaf:based_near ?near .
        ?near geo:lat ?latitude ;
              geo:long ?longitude .
      }
    `
    // Note: must use a SPARQL endpoint that allows setting the default graph URI, which many don't, including DBPedia
    // const sparql_endpoint = "https://dbpedia.org/sparql"
    const sparql_endpoint = "https://linkeddata.uriburner.com/sparql"
    const queryParams = new URLSearchParams({
      'query': query,
      'format': 'json',
      'should-sponge': 'soft',
      'timeout': 30000000
    })
    const graphUris = this.state.foafuris.map(uri => {
      return `default-graph-uri=${encodeURI(uri)}`
    }).join('&')
    const headers = new Headers({
      'Content-Type': 'application/json',
    })
    const mode = 'no-cors'
    const method = 'get'
    const options = { headers, method }
    const url = `${sparql_endpoint}?${queryParams}&${graphUris}`
    fetch(url, options).then(response => {
      return response.json()
    }).then(data => {
      return data.results.bindings.map(person => {
        return {
          type: 'Feature',
          properties: {
            name: person.name.value
          },
          geometry: {
            type: 'Point',
            coordinates: [person.longitude.value, person.latitude.value].map(parseFloat)
          }
        }
      })
    }).then(features => {
      // this.addGeoJSONLayer({'type': 'FeatureCollection', features })
      this.setState({geojsonLayer: null, geojson: { 'type': 'FeatureCollection', features }})
    }).catch(error => console.error(error))
  }

  addGeoJSONLayer(geojson) {
    // create a native Leaflet GeoJSON SVG Layer to add as an interactive overlay to the map
    // an options object is passed to define functions for customizing the layer
    const geojsonLayer = L.geoJson(geojson, {
      onEachFeature: this.onEachFeature,
      pointToLayer: this.pointToLayer,
    });
    // add our GeoJSON layer to the Leaflet map object
    geojsonLayer.addTo(this.state.map);
    // store the Leaflet GeoJSON layer in our component state for use later
    this.setState({ geojsonLayer });
    // fit the geographic extent of the GeoJSON layer within the map's bounds / viewport
    this.zoomToFeature(geojsonLayer);
  }

  removeGeoJSONLayer() {
    this.state.map && this.state.geojsonLayer && this.state.map.removeLayer(this.state.geojsonLayer)
  }

  zoomToFeature(target) {
    // set the map's center & zoom so that it fits the geographic extent of the layer
    this.state.map.fitBounds(target.getBounds());
  }

  pointToLayer(feature, latlng) {
    // renders our GeoJSON points as circle markers, rather than Leaflet's default image markers
    // parameters to style the GeoJSON markers
    var markerParams = {
      radius: 4,
      fillColor: 'orange',
      color: '#fff',
      weight: 1,
      opacity: 0.5,
      fillOpacity: 0.8
    };

    return L.circleMarker(latlng, markerParams);
  }

  onEachFeature(feature, layer) {
    let popupContent
    if (feature.properties && feature.properties.name) {
      popupContent = `<h3>${feature.properties.name}</h3>`
    }
    if (popupContent) {
      layer.bindPopup(popupContent);
    }
  }

  init(id) {
    if (this.state.map) return;
    // this function creates the Leaflet map object and is called after the Map component mounts
    let map = L.map(id, config.params);
    L.control.zoom({ position: "bottomleft"}).addTo(map);
    L.control.scale({ position: "bottomleft"}).addTo(map);

    // a TileLayer is used as the "basemap"
    const tileLayer = L.tileLayer(config.tileLayer.uri, config.tileLayer.params).addTo(map);

    // set our state to include the tile layer
    this.setState({ map, tileLayer });
  }

  render() {
    const { foafuris, inputVisible, inputValue } = this.state
    return (
      <div id="mapUI">
        <div ref={(node) => this._mapNode = node} id="map" />
        <div id="foafuri">
          {
            foafuris.map((uri, index) => {
              const tagElem = (
                <Tag key={uri} closable={true} onClose={() => this.handleTagClose(uri)}>{uri}</Tag>
              )
              return tagElem
            })
          }
          {
            inputVisible && (
              <Input
                ref={this.saveInputRef}
                type="text"
                size="small"
                style={{ width: 200 }}
                value={inputValue}
                onChange={this.handleTagInputChange}
                onBlur={this.handleTagInputConfirm}
                onPressEnter={this.handleTagInputConfirm}
              />
            )
          }
          {
            !inputVisible && (
              <Tag onClick={this.showInput} style={{ background: '#fff', borderStyle: 'dashed' }}>
                <Icon type="plus"/> New FOAF URI
              </Tag>
            )
          }
        </div>
      </div>
    );
  }
}

export default Map;
