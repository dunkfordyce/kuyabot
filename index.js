var fs = require('fs'),
    util = require('util'),
    irc = require('irc'),
    _ = require('underscore'),
    path = require('path'),
    sprintf = require('sprintf-js');


function get_or_make_array(obj, k) { 
    return obj[k] || (obj[k] = []);
}

function HUP_protect(f) { 
    f._dont_remove = true;
    return f;
}   

function Client() { 
    this.here = path.resolve('node_modules');
    this.config = JSON.parse(fs.readFileSync(require('findup-sync')('package.json')).toString());

    this.config.client.options.autoConnect = false;
    this._client = new irc.Client(
        this.config.client.server, 
        this.config.client.nick,
        this.config.client.options
    );

    this.nick = this.config.client.nick;

    this._client.on('error', function(e) { 
        console.log('ERROR!', e);
    });

    this._messages = {
        'notfound': '%(thing)s not found',
        'yes': 'yes', 
        'no': 'no',
        'saved': '%(thing)s saved'
    };

    this._listeners = {};

    this.on('removeListener', HUP_protect(_.bind(function(ev, func) { 
        this._client.removeListener(ev, func);
        var arr = get_or_make_array(this._listeners, ev);
        this._listeners[ev] = _.without(get_or_make_arr(this._listeners, ev), func);
    }, this)));
    this.on('newListener', HUP_protect(_.bind(function(ev, func) { 
        this._client.on(ev, func);
        get_or_make_array(this._listeners, ev).push(func);
    }, this)));

    this.on('HUP', HUP_protect(_.bind(function() { 
        _.each(this._listeners, _.bind(function(arr, ev) { 
            _.each(arr, _.bind(function(f) { 
                console.log('remove', ev, f);
                if( f._dont_remove ) { 
                    console.log('not removing protected func', f);
                } else { 
                    this._client.removeListener(ev, f);
                }
            }, this));
        }, this));

        this._listeners = {};

        Object.keys(this.config.dependencies).forEach(_.bind(function(key) { 
            if( key.indexOf('kuyabot-') === 0 ) { 
                console.log('auto-loading dependancy plugin', key);

                var fp = require.resolve(path.join(this.here, key));
                console.log(fp);
                if( require.cache[fp] ) { 
                    console.log('removing', fp, 'from cache..');
                    delete require.cache[fp];
                }

                try{
                    this.use(require(fp));
                } catch(e) { 
                    console.log('failed loading', key);
                    throw e;
                }
            }
        }, this));
    }, this)));

    this.emit('HUP');

    this._client.on('nick', _.bind(function(oldnick, newnick) { 
        if( oldnick == this.nick ) { this.nick = newnick; }
    }, this));

    console.log('connecting...');
    this._client.connect();
    this._client.once('registered', _.bind(function() { 
        this.nick = this._client.nick;
        console.log('connected!'); 
    }, this));
}

util.inherits(Client, process.EventEmitter);

Client.prototype.use = function(plugin) { 
    plugin(this);
};

Client.prototype.get_message = function(m) { 
    return this._messages[m];
};

Client.prototype.message = function(m, args) { 
    var t = this.get_message(m);
    if( t === undefined ) { 
        console.warn('no such message', m);
        return m;
    }
    try { 
        return sprintf.sprintf(t, args);
    } catch(e) { 
        console.error('failed message(', m, ',', args, ')', 'with t', t);
        throw e;
    }
};

Client.prototype.say_message = function(to, user, m, args) { 
    console.log('say_message', to, user);
    this.say(to, (user ? (user+': ') : '') + this.message(m, args));
};

['say', 'join', 'notice'].forEach(function(f) { 
    Client.prototype[f] = function() { this._client[f].apply(this._client, arguments); };
});

new Client();
