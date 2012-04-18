
(function (TeledrawCanvas) {
	TeledrawCanvas.canvases = [];
	var _id = 0;
	
	// global default tool settings
	var defaults = {
		tool: 'pencil',
		alpha: 255,
		color: [0, 0, 0],
		strokeSize: 1000,
		strokeSoftness: 0
	};
	
	// global default state
	var defaultState = {
		last: null,
		currentTool: 'pencil',
		previousTool: 'pencil',
		tool: null,
		mouseDown: FALSE,
		mouseOver: FALSE,
		width: null,
		height: null,
		
		currentZoom: 1,
		currentOffset: { x: 0, y: 0 },
		
		// if you are using strokeSoftness, make sure shadowOffset >= max(canvas.width, canvas.height)
		// related note: safari has trouble with high values for shadowOffset
		shadowOffset: 5000,
		
		// default limits
		maxHistory: 10,
		minStrokeSize: 500,
		maxStrokeSize: 10000,
		minStrokeSoftness: 0,
		maxStrokeSoftness: 100,
		maxZoom: 8 // (8 == 800%)
	};
	
	var Canvas = Canvas || function (w, h) {
		var c = document.createElement('canvas');
		c.width = w; c.height = h;
		return c;
	};
	
	var API = function (elt, options) {
		var self = this,
			element = self.element = $(elt),
			state = self.state = $.extend({}, defaultState, options);
		
		if (typeof element.get(0).getContext != 'function') {
			alert('Your browser does not support HTML canvas!');
			return;
		}
		
		state.width = state.displayWidth || state.width || parseInt(element.attr('width'));
		state.height = state.displayHeight || state.height || parseInt(element.attr('height'));
		state.fullWidth = state.fullWidth || state.width;
		state.fullHeight = state.fullHeight || state.height;
		
		if (state.width / state.height !== state.fullWidth / state.fullHeight) {
			//Display and full canvas aspect ratios differ!
			//Adjusting full size to match display aspect ratio...
			state.fullHeight = state.fullWidth * state.height / state.width;
		}
		
		element.attr({
			width: state.width,
			height: state.height
		});
		
		self._displayCanvas = $(element).get(0);
		
		self._canvas = new Canvas(state.fullWidth, state.fullHeight);
		
		self.history = new TeledrawCanvas.History(this);
		
		self.defaults();
		self.zoom(0);
		self.history.checkpoint();
		TeledrawCanvas.canvases[_id++] = self;
		
		var gInitZoom;
		element.css({ width: state.width, height: state.height })
			.bind('gesturestart', function (evt) {
	    		if (state.tool.name == 'grab') {
					gInitZoom = state.currentZoom;
	    		}
			})
			.bind('gesturechange', function (evt) {
	    		if (state.tool.name == 'grab') {
	    			var pt = state.last;//$.extend({},state.last);
	    			self.zoom(gInitZoom*evt.originalEvent.scale, pt.xd, pt.yd);
	    		}
	    		evt.preventDefault();
			})
			.bind('gestureend', function (evt) {
			})
			.bind('dblclick', function (evt) {
				var pt = getCoord(evt);
	            state.tool.dblclick(pt);
			})
			.bind('mouseenter', function (evt) {
	            var pt = getCoord(evt);
	            state.tool.enter(state.mouseDown, pt);
	            state.last = pt;
	            state.mouseOver = TRUE;
	        })      
	        .bind('mousedown touchstart', mouseDown)
	        .bind('mouseleave', function (evt) {
	            var pt = getCoord(evt);
	            state.tool.leave(state.mouseDown, pt);
	            state.mouseOver = FALSE;
	        });
        
        
	    $(window).bind('mousemove touchmove', mouseMove);
	   
	    var lastMoveEvent = null;
	    function mouseMove(e) {
	    	if (e.type == 'touchmove' && e.originalEvent.touches.length > 1) {
	    		return TRUE;
	    	}
	    	if (lastMoveEvent == 'touchmove' && e.type == 'mousemove') return;
	    	target = $(e.target).parents().andSelf();
	        if (target.is(element) || state.mouseDown) {
	        	var pt = getCoord(e);
				state.tool.move(state.mouseDown, state.last, pt);
				state.last = pt;
				self.trigger('mousemove', pt, e);
	            lastMoveEvent = e.type;
            	e.preventDefault();
	        }
	    }

	    function mouseDown(e) {
            var pt = state.last = getCoord(e);
	    	if (e.type == 'touchstart' && e.originalEvent.touches.length > 1) {
	    		return TRUE;
	    	}
            $(window)
                .one('mouseup touchend', mouseUp);
            
			state.mouseDown = TRUE;
			state.tool.down(pt);
			self.trigger('mousedown', pt, e);
			
        	document.onselectstart = function() { return FALSE; };
        	e.preventDefault();
        }
	    
	    function mouseUp(e) {
	    	if (e.type == 'touchend' && e.originalEvent.touches.length > 1) {
	    		return TRUE;
	    	}
	    	
			state.mouseDown = FALSE;
			state.tool.up(state.last);
			self.trigger('mouseup', state.last, e);
        
        	document.onselectstart = function() { return TRUE; };
        	e.preventDefault();
	    }
	    
		function getCoord(e) {
	        var offset = element.offset(),
		        pageX = e.pageX || e.originalEvent.touches && e.originalEvent.touches[0].pageX,
				pageY = e.pageY || e.originalEvent.touches && e.originalEvent.touches[0].pageY;
	        return {
	        	x: floor((pageX - offset.left)/state.currentZoom) + state.currentOffset.x || 0,
	        	y: floor((pageY - offset.top)/state.currentZoom) + state.currentOffset.y || 0,
	        	xd: floor(pageX - offset.left) || 0,
	        	yd: floor(pageY - offset.top) || 0
	        };
		}
	};
	
	var APIprototype = API.prototype;
	
	
	APIprototype.setRGBAArrayColor = function (rgba) {
		var state = this.state;
		if (rgba.length === 4) {
			state.globalAlpha = rgba.pop();
		}
		for (var i = rgba.length; i < 3; ++i) {
			rgba.push(0);
		}
		state.color = rgba;
		this.updateTool();
	};
	
	APIprototype.updateTool = function () {
		var lw = 1 + floor(pow(this.state.strokeSize / 1000.0, 2));
		var sb = floor(pow(this.state.strokeSoftness, 1.3) / 300.0 * lw);
		this.state.lineWidth = lw;
		this.state.shadowBlur = sb;
	};
	
	APIprototype.updateDisplayCanvas = function () {
		var dctx = this._displayCtx || (this._displayCtx = this._displayCanvas.getContext('2d')),
			off = this.state.currentOffset,
			zoom = this.state.currentZoom, 
			dw = dctx.canvas.width,
			dh = dctx.canvas.height,
			sw = dw / zoom,
			sh = dh / zoom;
		dctx.clearRect(0, 0, dw, dh);
		this.trigger('display.update:before');
		dctx.drawImage(this._canvas, off.x, off.y, sw, sh, 0, 0, dw, dh);
		this.trigger('display.update:after');
	};
	
	/* this version attempts at better performance, but I don't think it is actually significantly better.
	APIprototype.updateDisplayCanvas = function (tl, br) {
		var dctx = this._displayCtx || (this._displayCtx = this._displayCanvas.getContext('2d')),
			off = this.state.currentOffset,
			zoom = this.state.currentZoom,
			// bounding rect of the change
			stl = tl || { x: 0, y: 0 },
			sbr = br || { x: this._canvas.width, y: this._canvas.height },
			dtl = { x: floor((stl.x - off.x)*zoom), y: floor((stl.y - off.y)*zoom) },
			dbr = { x: floor((sbr.x - off.x)*zoom), y: floor((sbr.y - off.y)*zoom) },
			sw = sbr.x - stl.x,
			sh = sbr.y - stl.y,
			dw = dbr.x - dtl.x,
			dh = dbr.y - dtl.y;
		if (sw === 0 || sh === 0) {
			return;
		}
		// only clear and draw what we need to
		dctx.clearRect(dtl.x, dtl.y, dw, dh);
		dctx.drawImage(this._canvas, stl.x, stl.y, sw, sh, dtl.x, dtl.y, dw, dh);
	};
	*/
	
	
	// API
	
	// returns the HTML Canvas element associated with this tdcanvas
	APIprototype.canvas = function () {
	    return this._canvas;
	};

	// returns a 2d rendering context for the canvas element
	APIprototype.ctx = function () {
	    return this._ctx || (this._ctx = this._canvas.getContext('2d'));
	};
	
	// sets the cursor css to be used when the mouse is over the canvas element
	APIprototype.cursor = function (c) {
	    if (!c) {
	        c = "default";
	    }
	    var cursors = c.split(/,\s*/);
	    do {
	    	c = cursors.shift();
	    	this.element.css('cursor', c);
	    } while (c.length && this.element.css('cursor') != c);
	    return this;
	};
	
	// clears the canvas and (unless noCheckpoint===TRUE) pushes to the undoable history
	APIprototype.clear = function (noCheckpoint) {
	    var self = this,
			ctx = self.ctx();
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		if (noCheckpoint !== TRUE) {
			self.history.checkpoint();
		}
		self.updateDisplayCanvas();
		return self;
	};
	
	// resets the default tool and properties
	APIprototype.defaults = function () {
		var self = this;
		self.setTool('pencil');
		self.setAlpha(defaults.alpha);
		self.setColor(defaults.color);
		self.setStrokeSize(defaults.strokeSize);
		self.setStrokeSoftness(defaults.strokeSoftness);
		return self;
	};
	
	// returns a data url (image/png) of the canvas,
	// optionally a portion of the canvas specified by x, y, w, h
	APIprototype.toDataURL = function (x, y, w, h) {
		if (w && h) {
			w = parseInt(w);
			h = parseInt(h);
			x = x !== UNDEFINED ? x : 0;
			y = y !== UNDEFINED ? y : 0;
			
			var tmpcanvas = $('<canvas>').attr({
				width: w,
				height: h
			}).get(0);
			tmpcanvas.getContext('2d').drawImage(this.canvas(), x, y, w, h, 0, 0, w, h);
			return tmpcanvas.toDataURL();
		}
		return this.canvas().toDataURL();
	};
	
	// returns a new (blank) canvas element the same size as this tdcanvas element
	APIprototype.getTempCanvas = function (w, h) {
		var tmp = $('<canvas>').get(0);
		tmp.width = w || this._canvas.width;
		tmp.height = h || this._canvas.height;
		return tmp;
	};

	// draws an image data url to the canvas and when it's finished, calls the given callback function
	APIprototype.fromDataURL = function (url, cb) {
		var self = this,
			img = new Image();
		img.onload = function () {
			self.clear(TRUE);
			self.ctx().drawImage(img, 0, 0);
			self.updateDisplayCanvas();
			if (typeof cb == 'function') {
				cb.call(self);
			}
		};
		img.src = url;
		return self;
	};

	// returns the ImageData of the whole canvas element
	APIprototype.getImageData = function () {
		var ctx = this.ctx();
	    return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
	};

	// sets the ImageData of the canvas
	APIprototype.putImageData = function (data) {
		this.ctx().putImageData(data, 0, 0);
		this.updateDisplayCanvas();
		return this;
	};
	
	// returns the current color in the form [r, g, b, a] (where each can be [0,255])
	APIprototype.getColor = function () {
	    return this.state.color.slice();
	};
	
	// sets the current color, either as an array (see getColor) or any acceptable css color string
	APIprototype.setColor = function (color) {
		if (!$.isArray(color)) {
			color = TeledrawCanvas.util.parseColorString(color);
		}
		this.setRGBAArrayColor(color);
		return this;
	};
	
	// sets the current alpha to a, where a is a number in [0,1]
	APIprototype.setAlpha = function (a) {
		this.state.globalAlpha = clamp(a, 0, 1);
		return this;
	};
	
	// returns the current alpha
	APIprototype.getAlpha = function () {
		return this.state.globalAlpha;
	};
	
	// sets the current stroke size to s, where a is a number in [minStrokeSize, maxStrokeSize]
	// lineWidth = 1 + floor(pow(strokeSize / 1000.0, 2));
	APIprototype.setStrokeSize = function (s) {
		this.state.strokeSize = clamp(s, this.state.minStrokeSize, this.state.maxStrokeSize);
		this.updateTool();
		return this;
	};
	
	// sets the current stroke size to s, where a is a number in [minStrokeSoftness, maxStrokeSoftness]
	APIprototype.setStrokeSoftness = function (s) {
		this.state.strokeSoftness = clamp(s, this.state.minStrokeSoftness, this.state.maxStrokeSoftness);
		this.updateTool();
		return this;
	};
	
	// set the current tool, given the string name of the tool (e.g. 'pencil')
	APIprototype.setTool = function (name) {
		this.state.previousTool = this.state.currentTool;
		this.state.currentTool = name;
		if (!TeledrawCanvas.tools[name]) {
			throw new Error('Tool "'+name+'" not defined.');
		}
		this.state.tool = new TeledrawCanvas.tools[name](this);
		this.updateTool();
		return this;
	};
	
	
	APIprototype.previousTool = function () {
		return this.setTool(this.state.previousTool);
	};
	
	// undo to the last history checkpoint (if available)
	APIprototype.undo = function () {
		this.history.undo();
		return this;
	};
	
	// redo to the next history checkpoint (if available)
	APIprototype.redo = function () {
		this.history.redo();
		return this;
	};
	
	// resize the display canvas to the given width and height
	// (throws an error if it's not the same aspect ratio as the source canvas)
	// @todo/consider: release this constraint and just change the size of the source canvas?
	APIprototype.resize = function (w, h) {
		var self = this;
		if (w/h !== self._canvas.width/self._canvas.height) {
			throw new Error('Not the same aspect ratio!');
		}
		self._displayCanvas.width = w;
		self._displayCanvas.height = h;
		self.updateDisplayCanvas();
		return self;
	};
	
	// zoom the canvas to the given multiplier, z (e.g. if z is 2, zoom to 2:1)
	// optionally at a given point (in display canvas coordinates)
	// otherwise in the center of the current display
	APIprototype.zoom = function (z, x, y) {
		var self = this,
			panx = 0, 
			pany = 0,
			currentZoom = self.state.currentZoom,
			displayWidth = self._displayCanvas.width,
			displayHeight = self._displayCanvas.height;
			
		// if no point is specified, use the center of the canvas
		x = clamp(x || displayWidth/2, 0, displayWidth);
		y = clamp(y || displayHeight/2, 0, displayHeight);
		
		// restrict the zoom
		z = clamp(z || 0, displayWidth / self._canvas.width, self.state.maxZoom);
		if (z !== currentZoom) {
			if (z > currentZoom) {
				// zooming in
				panx = -(displayWidth/currentZoom - displayWidth/z)/2 - (x - displayWidth/2)/currentZoom;
				pany = -(displayHeight/currentZoom - displayHeight/z)/2 - (y - displayHeight/2)/currentZoom;
			} else if (z < currentZoom) {
				// zooming out
				panx = (displayWidth/z - displayWidth/currentZoom)/2;
				pany = (displayHeight/z - displayHeight/currentZoom)/2;
			}
			panx *= z;
			pany *= z;
		}
		//console.log(panx, pany);
		self.state.currentZoom = z;
		self.trigger('zoom', z, currentZoom);
		self.pan(panx, pany);
		self.updateDisplayCanvas();
		return self;
	};
	
	// pan the canvas to the given (relative) x,y position
	// unless absolute === TRUE
	APIprototype.pan = function (x, y, absolute) {
		var self = this,
			zoom = self.state.currentZoom,
			currentX = self.state.currentOffset.x,
			currentY = self.state.currentOffset.y,
			maxWidth = self._canvas.width - self._displayCanvas.width/zoom,
			maxHeight = self._canvas.height - self._displayCanvas.height/zoom;
		x = absolute === TRUE ? x/zoom : currentX - (x || 0)/zoom;
		y = absolute === TRUE ? y/zoom : currentY - (y || 0)/zoom;
		self.state.currentOffset = {
			x: floor(clamp(x, 0, maxWidth)),
			y: floor(clamp(y, 0, maxHeight))
		};
		self.trigger('pan', x, y);
		self.updateDisplayCanvas();
		return self;
	};
	
	// events mixin
	$.extend(APIprototype, Events);
	TeledrawCanvas.api = API;
})(TeledrawCanvas);
