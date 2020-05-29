/*
 * Leaflet.curve.text v1.0.0 - a plugin for Leaflet mapping library for adding Text to curve path.
 * Leaflet.curve.text is forked from https://github.com/gautamGS/Leaflet.curve.text
 * (c) ringostarr80 2020
 */
/*
 * note that SVG (x, y) corresponds to (long, lat)
 */

L.Curve = L.Path.extend({
	options: {},
	mutationObserver: null,
	expectedIdToBeInserted: null,

	initialize: function(path, options) {
		const instance = this;
		this.expectedIdToBeInserted = null;
		this.mutationObserver = new MutationObserver(function(mutationList, observer) {
			if (!(SVGPathEditor && typeof SVGPathEditor.reverse === 'function')) {
				return;
			}
			if (!instance._textNode) {
				return;
			}
			if (!instance._textNode.firstChild) {
				return;
			}

			for(let mutation of mutationList) {
				if (mutation.type !== 'childList') {
					continue;
				}

				const dataOptionsAttr = instance._textNode.attributes.getNamedItem('data-options');
				if (dataOptionsAttr) {
					try {
						const dataOptions = JSON.parse(dataOptionsAttr.value);
						if (dataOptions.center) {
							const textLength = instance._textNode.getComputedTextLength();
							const pathLength = instance._path.getTotalLength();
							/* Set the position for the left side of the textNode */
							instance._textNode.setAttribute('dx', ((pathLength / 2) - (textLength / 2)));
							instance._textNode.removeAttribute('data-options');
						}
					} catch(exc) {
						console.warn(exc);
					}
				}

				if (instance.expectedIdToBeInserted) {
					for(const addedNode of mutation.addedNodes) {
						if (addedNode.nodeName !== 'path') {
							continue;
						}
						if (addedNode.id !== instance.expectedIdToBeInserted) {
							continue;
						}
	
						const dAttr = addedNode.attributes.getNamedItem('d');
						if (!dAttr) {
							continue;
						}
	
						const d = dAttr.value;
						const dReversed = SVGPathEditor.reverse(d);
						const reversedPathElement = addedNode.cloneNode(true);
						reversedPathElement.setAttribute('d', dReversed);
						reversedPathElement.setAttribute('id', addedNode.id + '-reversed');
						reversedPathElement.setAttribute('stroke-opacity', '0');
						addedNode.parentNode.insertBefore(reversedPathElement, addedNode);
						instance._textNode.firstChild.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", '#' + addedNode.id + '-reversed');
					}
				}

				for(const removedNode of mutation.removedNodes) {
					if (removedNode.nodeName !== 'path') {
						continue;
					}
					if (!removedNode.id) {
						continue;
					}
					if (removedNode.id.indexOf('curvepathdef-') !== 0) {
						continue;
					}

					const textPathReference = document.querySelector('textPath[*|href="#' + removedNode.id + '"]');
					if (textPathReference && instance.expectedIdToBeInserted) {
						const textReference = textPathReference.parentNode;
						if (textReference && textReference.parentNode) {
							textReference.parentNode.removeChild(textReference);
						}
					}

					const reversedId = removedNode.id + '-reversed';
					const reversedElement = document.getElementById(reversedId);
					if (!reversedElement) {
						continue;
					}

					reversedElement.parentElement.removeChild(reversedElement);
				}
			}
			instance.expectedIdToBeInserted = null;
		});
		this.mutationObserver.observe(document.body, {
			childList: true,
			subtree: true
		});

		L.setOptions(this, options);
		this._setPath(path);
	},

	getPath: function() {
		return this._coords;
	},

	setPath: function(path) {
		this._setPath(path);
		return this.redrawText();
	},

	getBounds: function() {
		return this._bounds;
	},

	_setPath: function(path) {
		this._coords = path;
		this._bounds = this._computeBounds();
	},

	_computeBounds: function() {
		const bound = new L.LatLngBounds();
		let lastPoint;
		let lastCommand;
		for(let i = 0; i < this._coords.length; i++){
			let coord = this._coords[i];
			if (typeof coord === 'string' || coord instanceof String) {
				lastCommand = coord;
			} else if (lastCommand === 'H') {
				bound.extend([lastPoint.lat,coord[0]]);
				lastPoint = new L.latLng(lastPoint.lat,coord[0]);
			} else if (lastCommand === 'V') {
				bound.extend([coord[0], lastPoint.lng]);
				lastPoint = new L.latLng(coord[0], lastPoint.lng);
			} else if (lastCommand === 'C') {
				const controlPoint1 = new L.latLng(coord[0], coord[1]);
				coord = this._coords[++i];
				const controlPoint2 = new L.latLng(coord[0], coord[1]);
				coord = this._coords[++i];
				const endPoint = new L.latLng(coord[0], coord[1]);

				bound.extend(controlPoint1);
				bound.extend(controlPoint2);
				bound.extend(endPoint);

				endPoint.controlPoint1 = controlPoint1;
				endPoint.controlPoint2 = controlPoint2;
				lastPoint = endPoint;
			} else if (lastCommand === 'S') {
				const controlPoint2 = new L.latLng(coord[0], coord[1]);
				coord = this._coords[++i];
				const endPoint = new L.latLng(coord[0], coord[1]);

				let controlPoint1 = lastPoint;
				if(lastPoint.controlPoint2){
					const diffLat = lastPoint.lat - lastPoint.controlPoint2.lat;
					const diffLng = lastPoint.lng - lastPoint.controlPoint2.lng;
					controlPoint1 = new L.latLng(lastPoint.lat + diffLat, lastPoint.lng + diffLng);
				}

				bound.extend(controlPoint1);
				bound.extend(controlPoint2);
				bound.extend(endPoint);

				endPoint.controlPoint1 = controlPoint1;
				endPoint.controlPoint2 = controlPoint2;
				lastPoint = endPoint;
			} else if (lastCommand === 'Q') {
				const controlPoint = new L.latLng(coord[0], coord[1]);
				coord = this._coords[++i];
				const endPoint = new L.latLng(coord[0], coord[1]);

				bound.extend(controlPoint);
				bound.extend(endPoint);

				endPoint.controlPoint = controlPoint;
				lastPoint = endPoint;
			} else if (lastCommand === 'T') {
				const endPoint = new L.latLng(coord[0], coord[1]);

				let controlPoint = lastPoint;
				if(lastPoint.controlPoint){
					const diffLat = lastPoint.lat - lastPoint.controlPoint.lat;
					const diffLng = lastPoint.lng - lastPoint.controlPoint.lng;
					controlPoint = new L.latLng(lastPoint.lat + diffLat, lastPoint.lng + diffLng);
				}

				bound.extend(controlPoint);
				bound.extend(endPoint);

				endPoint.controlPoint = controlPoint;
				lastPoint = endPoint;
			} else {
				bound.extend(coord);
				lastPoint = new L.latLng(coord[0], coord[1]);
			}
		}
		return bound;
	},

	//TODO: use a centroid algorithm instead
	getCenter: function () {
		return this._bounds.getCenter();
	},

	_update: function() {
		if (!this._map) {
			return;
		}

		this._updatePath();
	},

	_updatePath: function() {
		this._renderer._updatecurve(this);
		this._redrawText();
	},

	_redrawText: function() {
		const text = this._text;
		const options = this._textOptions;
		if (text) {
			this.setText(null).setText(text, options);
		}
	},

	getTextElement() {
		return this._textNode;
	},

	getText() {
		return this;
	},

	setText: function(text, options)
	{
		this.expectedIdToBeInserted = null;
		this._text = text;
		this._textOptions = options;
		if (!L.Browser.svg || typeof this._map === 'undefined') {
			return this;
		}

		const defaults = {
			fillColor: 'green',
			attributes: {},
			below: false,
			offset: 20,
			orientation :180,
			center : true
		};
		options = L.Util.extend(defaults, options);

		if (!text) {
			if (this._textNode && this._textNode.parentNode) {
				if (this._textNode.childNodes && this._textNode.childNodes instanceof NodeList) {
					for(const childNode of this._textNode.childNodes) {
						const xlinkHrefAttr = childNode.attributes.getNamedItem('xlink:href');
						if (!xlinkHrefAttr) {
							continue;
						}

						const xlinkHref = xlinkHrefAttr.value;
						const xlinkHrefReversedMatch = xlinkHref.match(/-reversed$/);
						if (!xlinkHrefReversedMatch) {
							continue;
						}

						const reversedPathElement1 = document.querySelector(xlinkHref);
						if (!reversedPathElement1) {
							continue;
						}

						reversedPathElement1.parentNode.removeChild(reversedPathElement1);
					}
				}
				this._map._renderer._container.removeChild(this._textNode);
				/* delete the node, so it will not be removed a 2nd time if the layer is later removed from the map */
				delete this._textNode;
			}
			return this;
		}

		//replace texts Non breakable spaces
		text = text.replace(/ /g, '\u00A0');  // Non breakable spaces

		const id = 'curvepathdef-' + L.Util.stamp(this);
		const svg = this._map._renderer._container;
		this._path.setAttribute('id', id);

		/* Put it along the path using textPath */
		const textNode = L.SVG.create('text');
		const textPath = L.SVG.create('textPath');

		const dy = options.offset || this._path.getAttribute('stroke-width');

		textPath.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", '#' + id);

		let reversedPathElement = document.getElementById(id + '-reversed');
		if (reversedPathElement) {
			reversedPathElement.parentNode.removeChild(reversedPathElement);
		}
		if (options.orientation === 'reverse') {
			if (SVGPathEditor && typeof SVGPathEditor.reverse === 'function') {
				options.orientation = 0;
				const pathElement = document.getElementById(id);
				if (pathElement) {
					const dAttr = pathElement.attributes.getNamedItem('d');
					if (dAttr) {
						const d = dAttr.value;
						const dReversed = SVGPathEditor.reverse(d);
						reversedPathElement = pathElement.cloneNode(true);
						reversedPathElement.setAttribute('d', dReversed);
						reversedPathElement.setAttribute('id', id + '-reversed');
						reversedPathElement.setAttribute('stroke-opacity', '0');
						pathElement.parentNode.insertBefore(reversedPathElement, pathElement);
						textPath.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", '#' + id + '-reversed');
					}
				} else {
					this.expectedIdToBeInserted = id;
				}
			} else {
				console.warn('SVGPathEditor is not available (see: https://github.com/Pomax/svg-path-reverse). Fallback to flipping the text!');
				options.orientation = 'flip';
			}
		}

		textNode.setAttribute('dy', dy);
		for(const attr in options.attributes) {
			textNode.setAttribute(attr, options.attributes[attr]);
		}

		textPath.appendChild(document.createTextNode(text));
		textNode.appendChild(textPath);
		this._textNode = textNode;

		if (options.below) {
			svg.insertBefore(textNode, svg.firstChild);
		} else {
			svg.appendChild(textNode);
		}

		/* Center text according to the path's bounding box */
		if (options.center) {
			const textLength = textNode.getComputedTextLength();
			const pathLength = this._path.getTotalLength();
			
			if (textLength === 0) {
				textNode.setAttribute('data-options', JSON.stringify(options));
			}
			/* Set the position for the left side of the textNode */
			textNode.setAttribute('dx', ((pathLength / 2) - (textLength / 2)));
		}

		/* Change label rotation (if required) */
		if (options.orientation) {
			let rotateAngle = 0;
			switch (options.orientation) {
				case 'flip':
					rotateAngle = 180;
					break;
				case 'perpendicular':
					rotateAngle = 90;
					break;
				default:
					rotateAngle = options.orientation;
			}

			const rotatecenterX = (textNode.getBBox().x + textNode.getBBox().width / 2);
			const rotatecenterY = (textNode.getBBox().y + textNode.getBBox().height / 2);
			
			textNode.setAttribute('transform','rotate(' + rotateAngle + ' '  + rotatecenterX + ' ' + rotatecenterY + ')');
		}

		/*---return the modified element back */
		return this;
	},
	_project: function() {
		let coord;
		let lastCoord;
		let curCommand;
		let curPoint;

		this._points = [];

		for(let i = 0; i < this._coords.length; i++) {
			coord = this._coords[i];
			if (typeof coord === 'string' || coord instanceof String) {
				this._points.push(coord);
				curCommand = coord;
			} else {
				switch(coord.length) {
					case 2:
						curPoint = this._map.latLngToLayerPoint(coord);
						lastCoord = coord;
						break;
					case 1:
						if (curCommand === 'H') {
							curPoint = this._map.latLngToLayerPoint([lastCoord[0], coord[0]]);
							lastCoord = [lastCoord[0], coord[0]];
						} else {
							curPoint = this._map.latLngToLayerPoint([coord[0], lastCoord[1]]);
							lastCoord = [coord[0], lastCoord[1]];
						}
						break;
				}
				this._points.push(curPoint);
			}
		}
	}
});

L.curve = function (path, options) {
	return new L.Curve(path, options);
};

L.SVG.include({
	_updatecurve: function(layer) {
		this._setPath(layer, this._curvePointsToPath(layer._points));
	},
 	_curvePointsToPath: function(points) {
		let point;
		let curCommand;
		let str = '';
		for(let i = 0; i < points.length; i++) {
			point = points[i];
			if (typeof point == 'string' || point instanceof String) {
				curCommand = point;
				str+= curCommand;
			} else {
				switch(curCommand) {
					case 'H':
						str+= point.x + ' ';
						break;
					case 'V':
						str+= point.y + ' ';
						break;
					default:
						str+= point.x + ',' + point.y + ' ';
						break;
				}
			}
		}

		return str || 'M0 0';
	}
});
