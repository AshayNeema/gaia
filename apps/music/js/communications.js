/* exported MusicComms */
/* global musicdb, ModeManager, MODE_PLAYER, PlayerView,
          PLAYSTATUS_PLAYING, PLAYSTATUS_STOPPED, INTERRUPT_BEGIN, TYPE_MIX,
          MediaRemoteControls */
'use strict';

var MusicComms = {
  commands: {
    play: function(event) {
      this.commands.playpause.call(this, event);
    },

    // For those bluetooth devices that do not keep, request or receive
    // the play status, because the play status may not sync with the player,
    // they will just send "play" or "playpause" when pressing the "playpause"
    // button, so for the "play" and "playpause" commands, we will check
    // the play status for the player then decide we should play or pause.
    playpause: function(event) {
      this._getPlayerReady(function() {
        var isResumedBySCO = this.isSCOEnabled;
        this.isSCOEnabled = event.detail.isSCOConnected;

        // Check if it's resumed by the SCO disconnection, if so, we need to
        // recover the player to the original status.
        if (isResumedBySCO) {
          if ((this._statusBeforeSCO === PLAYSTATUS_PLAYING) ||
              ((this._statusBeforeSCO === INTERRUPT_BEGIN) &&
              (this.getCurrentAudioChannel() === "ringer")))
          {
            PlayerView.play();
          } else {
            PlayerView.pause();
          }
        } else {
          // Play in shuffle order if music app is launched remotely.
          if (PlayerView.playStatus === PLAYSTATUS_STOPPED) {
            musicdb.getAll(function remote_getAll(dataArray) {
              ModeManager.push(MODE_PLAYER, function() {
                PlayerView.setSourceType(TYPE_MIX);
                PlayerView.dataSource = dataArray;
                PlayerView.setShuffle(true);
                PlayerView.play(PlayerView.shuffledList[0]);
              });
            });
          } else if (PlayerView.playStatus === PLAYSTATUS_PLAYING) {
            PlayerView.pause();
          } else {
            PlayerView.play();
          }
        }
      }.bind(this));
    },

    pause: function(event) {
      this.isSCOEnabled = event.detail.isSCOConnected;

      if (!this._isPlayerActivated()) {
        return;
      }

      // Record the current play status so that we can recover the player to
      // the original status after SCO is disconnected.
      if (this.isSCOEnabled) {
        this._statusBeforeSCO = PlayerView.playStatus;
      }

      PlayerView.pause();
    },

    stop: function(event) {
      if (!this._isPlayerActivated()) {
        return;
      }

      PlayerView.stop();
    },

    next: function(event) {
      if (!this._isPlayerActivated()) {
        return;
      }

      PlayerView.next();
    },

    previous: function(event) {
      if (!this._isPlayerActivated()) {
        return;
      }

      PlayerView.previous();
    },

    seekpress: function(event) {
      if (!this._isPlayerActivated()) {
        return;
      }

      if (!PlayerView.isTouching) {
        PlayerView.startFastSeeking(event.detail.direction);
      }
    },

    seekrelease: function(event) {
      if (!this._isPlayerActivated()) {
        return;
      }

      PlayerView.stopFastSeeking();
    },

    updatemetadata: function() {
      // After A2DP is connected, some bluetooth devices will try to synchronize
      // the playing metadata with the player, if the player is not ready, we
      // have to initial the player to have the metadata, even the player is
      // stopped.
      this._getPlayerReady(function() {
        PlayerView.updateRemoteMetadata();
      });
    },

    updateplaystatus: function() {
      // After A2DP is connected, some bluetooth devices will try to synchronize
      // the playstatus with the player, if the player is not ready, we have to
      // initial the player to have the play status.
      this._getPlayerReady(function() {
        PlayerView.updateRemotePlayStatus();
      });
    }
  },

  enabled: false,

  isSCOEnabled: false,

  _statusBeforeSCO: null,

  init: function() {
    // The Media Remote Controls object will handle the remote commands.
    this.mrc = new MediaRemoteControls();

    // Load the iac_handler for Inter-App communication(IAC) between music
    // and system APP.
    LazyLoader.load('shared/js/iac_handler.js');

    // Add command listeners base on what commands the MusicComms has.
    for (var command in this.commands) {
      this.mrc.addCommandListener(command, this.commands[command].bind(this));
    }

    // Update the SCO status after the mrc is ready, so that we can know the
    // current SCO connection and reflect it to the player.
    this.mrc.start(this.updateSCOStatus.bind(this));

    this.mrc.notifyAppInfo({
      origin: window.location.origin,
      icon: window.location.origin + '/style/icons/music_84.png'
    });

    this.enabled = true;
  },

  _getPlayerReady: function(callback) {
    ModeManager.waitForView(MODE_PLAYER, callback);
  },

  _isPlayerActivated: function() {
    return (typeof PlayerView !== 'undefined' &&
      PlayerView.playStatus !== PLAYSTATUS_STOPPED);
  },

  notifyMetadataChanged: function(metadata) {
    if (this.enabled) {
      this.mrc.notifyMetadataChanged(metadata);
    }
  },

  notifyStatusChanged: function(info) {
    if (this.enabled) {
      this.mrc.notifyStatusChanged(info);
    }
  },

  updateSCOStatus: function() {
    if (this.enabled) {
      this.mrc.getSCOStatus(function(status) {
        this.isSCOEnabled = status;
      }.bind(this));
    }
  },

  // Update the current channel to handle Interrupts by requesting system App
  // using IAC handler.
  updateAudioChannel: function() {
    var self = this;
    var port = IACHandler.getPort('mediacomms-interrupt');
    if (!port) {
      return;
    }

    // Sending request message to system app for current channel
    port.postMessage({requestaudioChannel: 'requestaudioChannel'});

    // On change of audio-channel get the channel information from System App.
    port.onmessage = function(evt) {
      self.mrc.audioChannel = evt.data.currentAudioChannel;
    };
  },

  getCurrentAudioChannel: function() {
    return this.mrc.audioChannel;
  }
};
