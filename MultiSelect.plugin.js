/**
 * @name MultiSelect
 * @source https://github.com/Torca2001/MultiSelect/blob/master/MultiSelect.plugin.js
 * @website https://github.com/Torca2001
 * @authorId 97842053588713472
 * @version 1.1.4
 */
/* @cc_on
@if (@_jscript)

  // Offer to self-install for clueless users that try to run this directly.
  var shell = WScript.CreateObject('WScript.Shell');
  var fs = new ActiveXObject('Scripting.FileSystemObject');
  var pathPlugins = shell.ExpandEnvironmentStrings('%APPDATA%\\BetterDiscord\\plugins');
  var pathSelf = WScript.ScriptFullName;
  // Put the user at ease by addressing them in the first person
  shell.Popup('It looks like you\'ve mistakenly tried to run me directly. \n(Don\'t do that!)', 0, 'I\'m a plugin for BetterDiscord', 0x30);
  if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
    shell.Popup('I\'m in the correct folder already.\nJust reload Discord with Ctrl+R.', 0, 'I\'m already installed', 0x40);
  } else if (!fs.FolderExists(pathPlugins)) {
    shell.Popup('I can\'t find the BetterDiscord plugins folder.\nAre you sure it\'s even installed?', 0, 'Can\'t install myself', 0x10);
  } else if (shell.Popup('Should I copy myself to BetterDiscord\'s plugins folder for you?', 0, 'Do you need some help?', 0x34) === 6) {
    fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
    // Show the user where to put plugins in the future
    shell.Exec('explorer ' + pathPlugins);
    shell.Popup('I\'m installed!\nJust reload Discord with Ctrl+R.', 0, 'Successfully installed', 0x40);
  }
  WScript.Quit();

@else@ */
module.exports = (() => {
  const config = {
    info: {
      name: 'MultiSelect',
      authors: [{
        name: 'Torca',
        discord_id: '97842053588713472',
        github_username: 'Torca2001',
      }, ],
      version: '1.1.4',
      description: 'Allows you to CTRL/Shift click users in voice or the voice channel for all. To move selected users in mass to another voice channel by right clicking and choosing to move users',
      github: 'https://github.com/Torca2001',
      github_raw: 'https://raw.githubusercontent.com/Torca2001/MultiSelect/master/MultiSelect.plugin.js',
    },
    changelog: [
      {
        title: 'Rework',
        type: 'updated',
        items: ['Reworked underlying code to simplify and improve implementation', 'Fixed menu not having move option', 'added settings to adjust move interval'],
      }
    ],
    defaultConfig: [
      {
        type: "textbox",
        id: "moveInterval",
        value: "80",
        name: "Move interval",
        note: "in ms, delay between moving users to prevent being flagged as api abuse."
      },
    ],
  };

  return !global.ZLibrary ? class {
    constructor() { this._config = config; }
    getName() { return config.info.name; }
    getAuthor() { return config.info.authors.map(a => a.name).join(", "); }
    getDescription() { return config.info.description; }
    getVersion() { return config.info.version; }
    load() {
        BdApi.showConfirmationModal("Library plugin is needed",
            [`The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`], {
            confirmText: "Download",
            cancelText: "Cancel",
            onConfirm: () => {
                require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", async (error, response, body) => {
                    if (error) return require("electron").shell.openExternal("https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js");
                    await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, r));
                });
            }
        });
    }
    start() { }
    stop() { }
    } : (([Plugin, Api]) => {
      const plugin = (Plugin, Api) => {
        const {DiscordModules: {React, DiscordConstants}, ReactTools, DiscordSelectors, Utilities, WebpackModules, PluginUtilities, DiscordModules, ContextMenu, Patcher, Logger, Toasts} = Api;
        const voiceStates = WebpackModules.getByProps("getVoiceStatesForChannel");
        const voiceUserComponent = WebpackModules.findByDisplayName('VoiceUser');
        const voiceUserSelector = BdApi.findModuleByProps("voiceUser").voiceUser;
        const channelItemComponent = WebpackModules.getModule(m => Object(m.default).displayName === "ChannelItem");
        const MenuSeparator = ZLibrary.WebpackModules.getByProps("MenuSeparator").MenuSeparator;

        return class MultiSelect extends Plugin {
          cancelled = false;
          guild_id = "";
          selectedUsers = new Set();

          constructor() {
            super();
          }

          getSettingsPanel() {
              const panel = this.buildSettingsPanel();
              panel.addListener(() => {
                  //this.forceUpdateAll();
              });
              return panel.getElement();
          }

          onStart() {
            this.cancelled = false;
            PluginUtilities.addStyle(config.info.name, this.css);
            this.PatchAll();
          }

          async PatchAll(){
            Patcher.after(voiceUserComponent.prototype, "render", this.voiceUserRenderPatch.bind(this));
            Patcher.after(channelItemComponent, "default", this.ChannelItemPatch.bind(this));
    
            //Force update
            document.querySelectorAll(DiscordSelectors.ChannelList.containerDefault).forEach(e => {
                ReactTools.getOwnerInstance(e).forceUpdate();
            });
    
            this.findContextMenu('useChannelDeleteItem').then((e) => {
                if (this.cancelled) return;
    
                Patcher.after(e.module, "default", this.channelMenuPatch.bind(this));
            })
          }

          onStop() {
            this.cancelled = true;
            PluginUtilities.removeStyle(config.info.name);
            Patcher.unpatchAll();

            for (let unpatch of this.contextMenuPatches) {
              try {
                  unpatch();
              }
              catch(e){
                  //Do nothing
              }
            }
          }

          channelMenuPatch(_, [props], retVal){
            if (props.type != 2) return;
    
            if (props.guild_id != this.guild_id){
                this.guild_id = props.guild_id;
                this.selectedUsers.clear();
            }
    
            if (this.selectedUsers.size <= 0 || !this.canMoveInChannel(props.id)) {
                return [retVal];
            };
    
            const newOne = ContextMenu.buildMenuItem({
                label: `Move ${this.selectedUsers.size} here`,
                action: () => {
                    this.moveSelectedUsers(this.guild_id, props.id);
                    this.selectedUsers.clear();
                }
            });
    
            return [
                newOne,
                DiscordModules.React.createElement(MenuSeparator),
                retVal
            ];
          }

          moveSelectedUsers(guildID, channelID){
            let wait = 80;
            if (!isNaN(this.settings.moveInterval) && this.settings.moveInterval > 10){
              wait = Number(this.settings.moveInterval);
            }
            let giveup = wait + 750;
    
            let users = Array.from(this.selectedUsers);
            let i = 0;
    
            Toasts.info('Moving ' + users.length + " users");
            let moveUser = () => {
              DiscordModules.APIModule.patch({
                  url: DiscordModules.DiscordConstants.Endpoints.GUILD_MEMBER(guildID, users[i]),
                  body: {
                    channel_id: channelID
                  }
              }).then((e) => {
                if (e.status === 200 || e.status === 204) {
                  i++;
                }

                if (i < users.length && wait < giveup){
                  setTimeout(moveUser, wait);
                }
                else {
                  Toasts.info("Moving complete");
                }
              }).catch((e) => {
                wait += 50;
                Toasts.error("Rate limited");
                if (wait < giveup && e.status !== 403){
                  setTimeout(moveUser, wait);
                }
                else {
                  Toasts.error('Error stopping move');
                }
              });
            }
    
            moveUser();
          }

          voiceUserRenderPatch(org,args,resp){
            let oldfunc = resp.props.onClick;
            resp.props.onClick = (e) => {
                if (e.ctrlKey || e.shiftKey){
    
                    if (org.props.guildId != this.guild_id){
                        this.guild_id = org.props.guildId;
                        this.selectedUsers.clear();
                    }
    
                    if (this.selectedUsers.has(org.props.user.id)){
                        this.selectedUsers.delete(org.props.user.id);
                    }
                    else{
                        this.selectedUsers.add(org.props.user.id);
                    }
    
                    let current = e.target;
                    while (current != undefined && current.classList){
                        if (current.classList.contains(voiceUserSelector)){
                            current.classList.toggle('selectedVoiceUser', this.selectedUsers.has(org.props.user.id))
                            break;
                        }
                        current = current.parentNode;
                    }
                }
                else{
                    oldfunc(e);
                }
            };
    
            resp.props.onClick = resp.props.onClick.bind(this);
            if (this.selectedUsers.has(org.props.user.id)){
                resp.props.className += " selectedVoiceUser";
            }
          }

          ChannelItemPatch(_, [props], ret){
            if (!("channel" in props)) return ret;
            if (props.channel.type !== ZLibrary.DiscordModules.DiscordConstants.ChannelTypes.GUILD_VOICE) return ret;
            const children = ZLibrary.Utilities.getNestedProp(props, "children");
            if (!Array.isArray(children)) return ret;
    
            let oldClick = ret.props.children.props.onMouseDown;
            let oldUp = ret.props.children.props.onMouseUp;
    
            ret.props.children.props.onMouseUp = (e) => {
                if (e.shiftKey || e.ctrlKey) {
                    e.stopPropagation();
                    e.preventDefault();
                    //Suppress
                } else {
                    oldUp(e);
                }
            }
    
            ret.props.children.props.onMouseDown = (e) => {
                if ((e.shiftKey || e.ctrlKey) && e.button == 0){
                    e.stopPropagation();
                    e.preventDefault();
    
                    if (props.channel.guild_id != this.guild_id){
                        this.guild_id = props.channel.guild_id;
                        this.selectedUsers.clear();
                    }
    
                    let voicestates = Object.keys(voiceStates.getVoiceStatesForChannel(props.channel.id));
                    let alreadySelected = false;
                    for (const id of voicestates) {
                        if (this.selectedUsers.has(id)){
                            alreadySelected = true;
                            break;
                        }
                    }
    
                    if (alreadySelected){
                        for (const id of voicestates) {
                            this.selectedUsers.delete(id);
                        }
                    } else {
                        for (const id of voicestates) {
                            this.selectedUsers.add(id);
                        }
                    }
    
                    let defaultContainer = DiscordSelectors.ChannelList.containerDefault.value;
                    let dotindex = defaultContainer.indexOf('.') + 1;
                    defaultContainer = defaultContainer.substring(dotindex);
    
                    let current = e.target
                    while (current != undefined && current.classList){
                        if (current.classList.contains(defaultContainer)){
                            let voiceUsers = current.querySelectorAll("." + voiceUserSelector);
                            for (const voiceItem of voiceUsers) {
                                voiceItem.classList.toggle('selectedVoiceUser', !alreadySelected);
                            }
                            break;
                        }
                        current = current.parentNode;
                    }
    
                } else {
                    oldClick(e);
                }
            }
    
            let oldclick2 = ret.props.children.props.children[1].props.children[0].props.onClick;
            ret.props.children.props.children[1].props.children[0].props.onClick = undefined;
            ret.props.children.props.children[1].props.children[0].props.onMouseUp = (e) => {
                if (e.shiftKey || e.ctrlKey) {
                    //Suppress
                } else if (e.button == 0) {
                    oldclick2(e);
                }
            }
    
            return ret;
          }

          canMoveInChannel(channelID) {
            let channel = DiscordModules.ChannelStore.getChannel(channelID);
    
            if (!channel.guild_id) return true;
            return DiscordModules.Permissions.can({
                permission: DiscordModules.DiscordPermissions.MOVE_MEMBERS, 
                user: DiscordModules.UserStore.getCurrentUser().id, 
                context: channel
            });
          }

          contextMenuPatches = [];

          async findContextMenu(displayName) {
            const normalFilter = (exports) => exports && exports.default && exports.default.displayName === displayName;
            const nestedFilter = (module) => module.toString().includes(displayName);

            {
                const normalCache = WebpackModules.getModule(normalFilter);
                if (normalCache) return {type: "normal", module: normalCache};
            }

            {
                const webpackId = Object.keys(WebpackModules.require.m).find(id => nestedFilter(WebpackModules.require.m[id]));
                const nestedCache = webpackId !== undefined && WebpackModules.getByIndex(webpackId);
                if (nestedCache) return {type: "nested", module: nestedCache};
            }

            return new Promise((resolve) => {
              const listener = (exports, module) => {
                const normal = normalFilter(exports);
                const nested = nestedFilter(module);

                if (!nested && !normal) return;

                resolve({type: normal ? "normal" : "nested", module: exports});
                WebpackModules.removeListener(listener);
              };

              WebpackModules.addListener(listener);
              this.contextMenuPatches.push(() => {
                WebpackModules.removeListener(listener);
              });
            });
          }

          css = `
          .selectedVoiceUser>div {
            background-color: #005fff87;
            border-radius: 5px;
          }
          
          .selectedVoiceUser>div:hover{
            background-color: #04a7ff87 !important;
          }
          `
        }
      };

      return plugin(Plugin, Api);
  })(global.ZeresPluginLibrary.buildPlugin(config));
})();

/* @end@ */
