/**
 * @name MultiSelect
 * @source https://github.com/Torca2001/MultiSelect/blob/master/MultiSelect.plugin.js
 * @website https://github.com/Torca2001
 * @authorId 97842053588713472
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
/**
 * @todo fix USER_GUILD_MEMBERS not searching
 */
// eslint-disable-next-line no-unused-vars
const MultiSelect = (() => {
  const config = {
    info: {
      name: 'MultiSelect',
      authors: [
        {
          name: 'Torca',
          discord_id: '97842053588713472',
          github_username: 'Torca2001',
        },
      ],
      version: '1.0.0',
      description: 'Allows you to select multiple users (hold ctrl while click on them) in a voice chat to move them',
      github: 'https://github.com/Torca2001',
      github_raw: 'https://raw.githubusercontent.com/Torca2001/MultiSelect/master/MultiSelect.plugin.js',
    },
    changelog: [
      {
        title: 'Using BDv2 Plugin',
        type: 'updated',
        items: ['It somehow works'],
      },
    ],
  };

  const buildPlugin = ([Plugin, Api]) => {
    const { Patcher } = Api;
    const { MenuItem, MenuGroup } = BdApi.findModuleByProps('MenuGroup');
    const ContextMenuActions = BdApi.findModuleByProps('closeContextMenu');
    const allMenus = BdApi.findAllModules((x) => x && x.default && x.default.displayName && x.default.displayName.includes('ContextMenu'));
    const menusToPatch = ['ChannelListVoiceChannelContextMenu'];
    const finalMenus = allMenus.filter((x) => menusToPatch.includes(x.default.displayName));
    /*
    const findInTree = (tree, searchFilter, { walkable = null, ignore = [] } = {}) => {
      if (typeof searchFilter === 'string') {
        console.log('string');
        if (tree.hasOwnProperty(searchFilter)) {
          console.log('string1');
          return tree[searchFilter];
        }
      } else if (searchFilter(tree)) {
        console.log('string2');
        return tree;
      }
      if (typeof tree !== 'object' || tree == null) {
        console.log('not obj');
        return undefined;
      }
      let tempReturn;
      if (Array.isArray(tree)) {
        console.log('isArray');
        tree.forEach((value) => {
          tempReturn = findInTree(value, searchFilter, { walkable, ignore });
          if (typeof tempReturn !== 'undefined') return tempReturn;
        });
      } else {
        console.log('notArray');
        const toWalk = walkable == null ? Object.keys(tree) : walkable;
        toWalk.forEach((key) => {
          if (!tree.hasOwnProperty(key) || ignore.includes(key)) return;
          tempReturn = findInTree(tree[key], searchFilter, { walkable, ignore });
          if (typeof tempReturn !== 'undefined') return tempReturn;
        });
      }
      return tempReturn;
    };
    */

    // eslint-disable-next-line no-shadow
    return class MultiSelect extends Plugin {
      constructor() {
        super();
        this.contextMenuPatches = [];
      }

      onStart() {
        this.PreviousGuildId = ZeresPluginLibrary.DiscordModules.SelectedGuildStore.getGuildId();
        global.MultiSelectedUsers = {};
        this.promises = {
          state: { cancelled: false },
          cancel() {
            this.state.cancelled = true;
          },
        };
        this.patchUserContextMenu(this.promises.state);
        this.moveTimeoutTime = 200;
        document.addEventListener('click', this.UserClickEvent, true);
      }

      onSwitch(){
        let selectedguildid = ZeresPluginLibrary.DiscordModules.SelectedGuildStore.getGuildId();
        if (selectedguildid != this.PreviousGuildId){
          this.PreviousGuildId = selectedguildid;
          global.MultiSelectedUsers = {};
        }
      }

      onStop() {
        this.promises.cancel();
        this.unbindContextMenus();
        let tmp = Object.values(global.MultiSelectedUsers);
        for (let index = 0; index < tmp.length; index++) {
          if (tmp[index].Node != undefined){
            tmp[index].Node.style.background = '';
          }
        }
        global.MultiSelectedUsers = {};
        document.removeEventListener('click', this.UserClickEvent,true);
      }

      canMoveInChannel(chan) {
        return ZeresPluginLibrary.DiscordModules.Permissions.can(ZeresPluginLibrary.DiscordModules.DiscordPermissions.MOVE_MEMBERS, ZeresPluginLibrary.DiscordAPI.currentUser, chan);
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
    
        if ((e.ctrlKey || e.shiftKey) && IsVoiceUser){
          e.stopPropagation();
    
          let Treeitem = ZeresPluginLibrary.ReactTools.getReactInstance(UserDom);
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
    
      UserOnVoiceChannelInGuild(userid, guildid){
        if (BdApi.findModuleByProps('getVoiceStates').getAllVoiceStates()[guildid] != undefined){
          let tmplist = Object.values(BdApi.findModuleByProps('getVoiceStates').getAllVoiceStates()[guildid]);
          for (let index = 0; index < tmplist.length; index++) {
            if (tmplist[index].userId == userid){
              return true;
            }
          }
        }
        return false;
      }

      /* eslint-disable no-param-reassign */
      async patchUserContextMenu(promiseState) {
        if (promiseState.cancelled) return;
        finalMenus.forEach((menu) => {
          this.contextMenuPatches.push(
            Patcher.after(menu, 'default', (_, [props], retVal) => {
              if (!retVal || Object.values(global.MultiSelectedUsers).length < 1) return;
              //console.log(props);
              const original = retVal.props.children[0].props.children;
              const newOne = {
                $$typeof: Symbol.for('react.element'),
                key: null,
                props: {
                  children: [
                    {
                      $$typeof: Symbol.for('react.element'),
                      key: null,
                      props: {
                        action: () => {
                          ContextMenuActions.closeContextMenu();
                          const recipients = Object.values(global.MultiSelectedUsers);
                          let userIDX = 0;
                          const timeoutFunc = () => {
                            if (recipients[userIDX].Node != undefined){
                              recipients[userIDX].Node.style.background = '';
                            }

                            //Skip users that aren't in a voice channel anymore
                            while(this.UserOnVoiceChannelInGuild(recipients[userIDX].user.id, this.PreviousGuildId) == false){
                              userIDX++;
                              //Stop function
                              if (userIDX >= recipients.length){
                                return;
                              }
                            }

                            ZeresPluginLibrary.DiscordModules.APIModule.patch({
                              url: ZeresPluginLibrary.DiscordModules.DiscordConstants.Endpoints.GUILD_MEMBER(props.guild.id, recipients[userIDX].user.id),
                              body: {
                                channel_id: props.channel.id
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
                                ZeresPluginLibrary.Logger.warn(this.getName(), `Rate limited, new timeout ${this.moveTimeoutTime}`);
                                if (this.moveTimeoutTime<500) setTimeout(() => timeoutFunc(), this.moveTimeoutTime);
                              });
                          };

                          timeoutFunc();
                        },
                        id: 'move selected',
                        label: `Move ${Object.keys(global.MultiSelectedUsers).length} users here`,
                      },
                      ref: null,
                      type: MenuItem,
                      _owner: null,
                    }
                  ],
                },
                ref: null,
                type: MenuGroup,
                _owner: null,
              };
              if (Array.isArray(original)) original.splice(1, 0, newOne);
              else retVal.props.children.props.children = [original, newOne];
            })
          );
        });
        const menus = document.querySelectorAll('.layer-v9HyYc');
        menus.forEach((menu) => {
          // console.log(menu);
          if (!menu) return;
          const { stateNode } = menu.__reactEventHandlers$.children._owner;
          // console.log(stateNode);
          if (!stateNode) return;
          stateNode.forceUpdate();
          stateNode.updatePosition();
        });
      }
      /* eslint-enable no-param-reassign */

      unbindContextMenus() {
        this.contextMenuPatches.forEach((cancel) => cancel());
      }

      get [Symbol.toStringTag]() {
        return 'Plugin';
      }

      get name() {
        return config.info.name;
      }

      get short() {
        let string = '';

        for (let i = 0, len = config.info.name.length; i < len; i += 1) {
          const char = config.info.name[i];
          if (char === char.toUpperCase()) string += char;
        }

        return string;
      }

      get author() {
        return config.info.authors.map((author) => author.name).join(', ');
      }

      get version() {
        return config.info.version;
      }

      get description() {
        return config.info.description;
      }
    };
  };

  return !global.ZeresPluginLibrary
    ? class {
        getName() {
          return this.name.replace(/\s+/g, '');
        }

        getAuthor() {
          return this.author;
        }

        getVersion() {
          return this.version;
        }

        getDescription() {
          return this.description;
        }

        stop() {}

        load() {
          const header = 'Missing Library';
          const content = `The Library ZeresPluginLibrary required for ${this.name} is missing.`;
          const ModalStack = BdApi.findModuleByProps('push', 'update', 'pop', 'popWithKey');
          const TextElement = BdApi.findModuleByProps('Sizes', 'Weights');
          const ConfirmationModal = BdApi.findModule((m) => m.defaultProps && m.key && m.key() === 'confirm-modal');
          const onFail = () =>
            BdApi.getCore().alert(
              header,
              `
              ${content}<br/>
              Due to a slight mishap however, you'll have to download the library yourself.<br/><br/>
              <a href="http://betterdiscord.net/ghdl/?url=https://github.com/rauenzi/BDPluginLibrary/blob/master/release/0PluginLibrary.plugin.js"target="_blank">
              Click here to download ZeresPluginLibrary</a>
              `
            );
          if (!ModalStack || !ConfirmationModal || !TextElement) return onFail();
          ModalStack.push((props) =>
            BdApi.React.createElement(ConfirmationModal, {
              header,
              children: [TextElement({ color: TextElement.Colors.PRIMARY, children: [`${content} Please click Download Now to install it.`] })],
              red: false,
              confirmText: 'Download Now',
              cancelText: 'Cancel',
              onConfirm: () => {
                const request = require('request');
                const fs = require('fs');
                const path = require('path');
                const waitForLibLoad = (callback) => {
                  if (!global.BDEvents) return callback();
                  const onLoaded = (e) => {
                    if (e !== 'ZeresPluginLibrary') return;
                    BDEvents.off('plugin-loaded', onLoaded);
                    callback();
                  };
                  BDEvents.on('plugin-loaded', onLoaded);
                  return undefined;
                };
                request('https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js', (error, response, body) => {
                  if (error) return onFail();
                  fs.writeFile(path.join(window.ContentManager.pluginsFolder, '0PluginLibrary.plugin.js'), body, () => {});
                  waitForLibLoad(() => pluginModule.reloadPlugin(this.name));
                  return undefined;
                });
              },
              ...props,
            })
          );
          return undefined;
        }

        start() {}

        get [Symbol.toStringTag]() {
          return 'Plugin';
        }

        get name() {
          return config.info.name;
        }

        get short() {
          let string = '';
          for (let i = 0, len = config.info.name.length; i < len; i += 1) {
            const char = config.info.name[i];
            if (char === char.toUpperCase()) string += char;
          }
          return string;
        }

        get author() {
          return config.info.authors.map((author) => author.name).join(', ');
        }

        get version() {
          return config.info.version;
        }

        get description() {
          return config.info.description;
        }
      }
    : buildPlugin(global.ZeresPluginLibrary.buildPlugin(config));
})();

/* @end@ */
