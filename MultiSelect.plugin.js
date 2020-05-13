//META{"name":"MultiSelect", "src":"https://raw.githubusercontent.com/Torca2001/MultiSelect/master/MultiSelect.plugin.js", "version":"0.1.2"}*//
class MultiSelect {
  constructor(props) {
    this.handleContextMenu = this.handleContextMenu.bind(this);
  }
  getName() {
    return 'MultiSelect';
  }
  getVersion() {
    return '0.1.2';
  }
  getAuthor() {
    return 'Torca';
  }
  getDescription() {
    return 'Allows you to select multiple users (hold ctrl while click on them) in a voice chat to move them';
  }

  onSwitch(){
    let selectedguildid = ZLibrary.DiscordModules.SelectedGuildStore.getGuildId();
    if (selectedguildid != this.PreviousGuildId){
      this.PreviousGuildId = selectedguildid;
      global.MultiSelectedUsers = {};
    }
  }
  
  load() {}
  
  start() {
    this.PreviousGuildId = ZLibrary.DiscordModules.SelectedGuildStore.getGuildId();
    global.MultiSelectedUsers = {};
    let onLoaded = () => {
      try {
        if (!global.ZeresPluginLibrary) setTimeout(onLoaded, 1000);
        else this.initialize();
      } catch (err) {
        ZeresPluginLibrary.Logger.stacktrace(this.getName(), 'Failed to start!', err);
        ZeresPluginLibrary.Logger.err(this.getName(), `If you cannot solve this yourself, contact ${this.getAuthor()} and provide the errors shown here.`);
        this.stop();
        this.showToast(`[${this.getName()}] Failed to start! Check console (CTRL + SHIFT + I, click console tab) for more error info.`, { type: 'error', timeout: 10000 });
      }
    };
	
    const getDir = () => {
      // from Zeres Plugin Library, copied here as ZLib may not be available at this point
      const process = require('process');
      const path = require('path');
      if (process.env.injDir) return path.resolve(process.env.injDir, 'plugins/');
      switch (process.platform) {
        case 'win32':
          return path.resolve(process.env.appdata, 'BetterDiscord/plugins/');
        case 'darwin':
          return path.resolve(process.env.HOME, 'Library/Preferences/', 'BetterDiscord/plugins/');
        default:
          return path.resolve(process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : process.env.HOME + '/.config', 'BetterDiscord/plugins/');
      }
    };
    this.pluginDir = getDir();

    if (!global.XenoLib || !global.ZeresPluginLibrary) {
      const XenoLibMissing = !global.XenoLib;
      const zlibMissing = !global.ZeresPluginLibrary;
      const bothLibsMissing = XenoLibMissing && zlibMissing;
      const header = `Missing ${(bothLibsMissing && 'Libraries') || 'Library'}`;
      const content = `The ${(bothLibsMissing && 'Libraries') || 'Library'} ${(zlibMissing && 'ZeresPluginLibrary') || ''} ${(XenoLibMissing && (zlibMissing ? 'and XenoLib' : 'XenoLib')) || ''} required for ${this.getName()} ${(bothLibsMissing && 'are') || 'is'} missing.`;
      const ModalStack = BdApi.findModuleByProps('push', 'update', 'pop', 'popWithKey');
      const TextElement = BdApi.findModuleByProps('Sizes', 'Weights');
      const ConfirmationModal = BdApi.findModule(m => m.defaultProps && m.key && m.key() === 'confirm-modal');
      const onFail = () => BdApi.getCore().alert(header, `${content}<br/>Due to a slight mishap however, you'll have to download the libraries yourself. After opening the links, do CTRL + S to download the library.<br/>${(zlibMissing && '<br/><a href="https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js"target="_blank">Click here to download ZeresPluginLibrary</a>') || ''}${(zlibMissing && '<br/><a href="http://localhost:7474/XenoLib.js"target="_blank">Click here to download XenoLib</a>') || ''}`);
      if (!ModalStack || !ConfirmationModal || !TextElement) return onFail();
      ModalStack.push(props => {
        return BdApi.React.createElement(
          ConfirmationModal,
          Object.assign(
            {
              header,
              children: [BdApi.React.createElement(TextElement, { color: TextElement.Colors.PRIMARY, children: [`${content} Please click Download Now to install ${(bothLibsMissing && 'them') || 'it'}.`] })],
              red: false,
              confirmText: 'Download Now',
              cancelText: 'Cancel',
              onConfirm: () => {
                const request = require('request');
                const fs = require('fs');
                const path = require('path');
                const waitForLibLoad = callback => {
                  if (!global.BDEvents) return callback();
                  const onLoaded = e => {
                    if (e !== 'ZeresPluginLibrary') return;
                    BDEvents.off('plugin-loaded', onLoaded);
                    callback();
                  };
                  BDEvents.on('plugin-loaded', onLoaded);
                };
                const onDone = () => {
                  if (!global.pluginModule || (!global.BDEvents && !global.XenoLib)) return;
                  if (!global.BDEvents || global.XenoLib) onLoaded();
                  else {
                    const listener = () => {
                      onLoaded();
                      BDEvents.off('xenolib-loaded', listener);
                    };
                    BDEvents.on('xenolib-loaded', listener);
                  }
                };
                const downloadXenoLib = () => {
                  if (global.XenoLib) return onDone();
                  request('https://raw.githubusercontent.com/1Lighty/BetterDiscordPlugins/master/Plugins/1XenoLib.plugin.js', (error, response, body) => {
                    if (error) return onFail();
                    onDone();
                    fs.writeFile(path.join(this.pluginDir, '1XenoLib.plugin.js'), body, () => {});
                  });
                };
                if (!global.ZeresPluginLibrary) {
                  request('https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js', (error, response, body) => {
                    if (error) return onFail();
                    waitForLibLoad(downloadXenoLib);
                    fs.writeFile(path.join(this.pluginDir, '0PluginLibrary.plugin.js'), body, () => {});
                  });
                } else downloadXenoLib();
              }
            },
            props
          )
        );
      });
    } else onLoaded();
	
	document.addEventListener('click', this.UserClickEvent, true)
  }
  
  UserClickEvent(e){
    //Nothing to check
    if (e.path.length == 0){
      return;
    }

    let IsVoiceUser = false;
    let UserDom = e.path[0];
    let Found = false;
		for (let index = 0; index < e.path.length; index++) {
      if (e.path[index].classList == undefined){
        continue;
      }
        e.path[index].classList.forEach(classitem => {
        if (classitem.includes("voiceUser")){
          IsVoiceUser = true;
        }
        else if (IsVoiceUser && classitem.includes("draggable")){
          UserDom = e.path[index];
          Found = true;
        }
        });
      if (Found){
        break;
      }
    }

    if (e.ctrlKey && IsVoiceUser){
      e.stopPropagation();

      let Treeitem = ZLibrary.ReactTools.getReactInstance(UserDom);
      let ClickedUser = null;
      let overloadcount = 0;
      while(ClickedUser == null && Treeitem != null && overloadcount < 1000){
        if (Treeitem.memoizedProps != undefined && Treeitem.memoizedProps.user != undefined ){
          ClickedUser = Treeitem.memoizedProps.user;
        }else{
          Treeitem = Treeitem.child;
        }
        overloadcount++;
      }

      //No user
      if (ClickedUser == null){
        return;
      }

      if (global.MultiSelectedUsers[ClickedUser.id] != undefined){
        if (global.MultiSelectedUsers[ClickedUser.id].Node != undefined){
          global.MultiSelectedUsers[ClickedUser.id].Node.style.background = '';
        } 
        delete global.MultiSelectedUsers[ClickedUser.id];
      }
      else{
        global.MultiSelectedUsers[ClickedUser.id] = { user: ClickedUser, Node: UserDom};
        if (UserDom != undefined){
          UserDom.style.background = 'blue';
        } 
      }


    }


  }

  
  stop() {
    try {
      this.shutdown();
    } catch (err) {
      ZLibrary.Logger.stacktrace(this.getName(), 'Failed to stop!', err);
    }
  }
  
  initialize() {
    ZLibrary.PluginUpdater.checkForUpdate(this.getName(), this.getVersion(), 'https://raw.githubusercontent.com/Torca2001/MultiSelect/master/MultiSelect.plugin.js');
    this.tools = {
      getSelectedVoiceChannelId: ZLibrary.WebpackModules.getByProps('getVoiceChannelId').getVoiceChannelId,
      moveUserVoiceChannel: ZLibrary.WebpackModules.getByProps('setChannel').setChannel
    };
    this.ContextMenuItem = ZLibrary.DiscordModules.ContextMenuItem;
    this.ContextMenuGroup = ZLibrary.DiscordModules.ContextMenuItemsGroup;
    this.ContextMenuActions = ZLibrary.DiscordModules.ContextMenuActions;

    this.moveTimeoutTime = 200;
    this.PreviousGuildId = "0";
    XenoLib.patchContext(this.handleContextMenu);
  }
  
  shutdown() {
    let tmp = Object.values(global.MultiSelectedUsers);
    for (let index = 0; index < tmp.length; index++) {
      if (tmp[index].Node != undefined){
        tmp[index].Node.style.background = '';
      }
    }
    global.MultiSelectedUsers = {};
    document.removeEventListener('click', this.UserClickEvent,true);
    XenoLib.unpatchContext(this.handleContextMenu);
  }
  
  getVoiceChannel(id) {
    return ZLibrary.DiscordModules.ChannelStore.getChannel(id || this.tools.getSelectedVoiceChannelId());
  }
  
  canMoveInChannel(chan) {
    return ZLibrary.DiscordModules.Permissions.can(ZLibrary.DiscordModules.DiscordPermissions.MOVE_MEMBERS, ZLibrary.DiscordAPI.currentUser, chan);
  }
  
  handleContextMenu(thisObj, returnValue) {
    if (!returnValue || thisObj.props.type !== 'CHANNEL_LIST_VOICE') return;
    const chanId = thisObj.props.channel.id;
    const targetChan = this.getVoiceChannel(chanId);
    if ( !targetChan || !this.canMoveInChannel(targetChan) || Object.keys(global.MultiSelectedUsers).length == 0 ) return;
    returnValue.props.children[0].props.children.push(
      ZLibrary.DiscordModules.React.createElement(this.ContextMenuItem, {
        label: 'Move Selected Here',
        action: () => {
          this.ContextMenuActions.closeContextMenu();
          const recipients = Object.values(global.MultiSelectedUsers);
          let userIDX = 0;
          const timeoutFunc = () => {
            if (recipients[userIDX].Node != undefined){
              recipients[userIDX].Node.style.background = '';
            }
            ZLibrary.DiscordModules.APIModule.patch({
              url: ZLibrary.DiscordModules.DiscordConstants.Endpoints.GUILD_MEMBER(this.getVoiceChannel(chanId).guild_id, recipients[userIDX].user.id),
              body: {
                channel_id: chanId
              }
            })
              .then(e => {
                if (e.status === 204) {
                  userIDX++;
                  if (userIDX < recipients.length && this.moveTimeoutTime < 500) {
                    setTimeout(() => timeoutFunc(), this.moveTimeoutTime);
                  }
                  else{
                    global.MultiSelectedUsers = {};
                  }
                  
                }
              })
              .catch(e => {
                this.moveTimeoutTime += 50;
                ZLibrary.Logger.warn(this.getName(), `Rate limited, new timeout ${this.moveTimeoutTime}`);
                if (this.moveTimeoutTime<500) setTimeout(() => timeoutFunc(), this.moveTimeoutTime);
              });
          };
          timeoutFunc();
        }
      })
    );
  }
  
}
