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
      authors: [{
        name: 'Torca',
        discord_id: '97842053588713472',
        github_username: 'Torca2001',
      }, ],
      version: '1.1.0',
      description: 'Allows you to select multiple users (hold ctrl or shift while click on them) in a voice chat to move them, you can also ctrl/shift click a voice channel to select all',
      github: 'https://github.com/Torca2001',
      github_raw: 'https://raw.githubusercontent.com/Torca2001/MultiSelect/master/MultiSelect.plugin.js',
    },
    changelog: [{
        title: 'Cancel Toast',
        type: 'updated',
        items: ['Toast will show allowing you to cancel the move'],
      },
      {
        title: 'Fixed',
        type: 'updated',
        items: ['Fixed move option not appearing in menu',
          'Fixed the move function being broken due to changes'
        ],
      },
      {
        title: 'Fixed on startup',
        type: 'updated',
        items: ['Move option would not appear if plugin ran on startup, this has been fixed'],
      }
    ],
  };

  const buildPlugin = ([Plugin, Api]) => {
    const {
      Patcher
    } = Api;
    const {
      MenuItem,
      MenuGroup
    } = BdApi.findModuleByProps('MenuGroup');
    const ContextMenuActions = BdApi.findModuleByProps('closeContextMenu');
    allMenus = BdApi.findAllModules((x) => x && x.default && x.default.displayName && x.default.displayName.includes('ContextMenu'));
    menusToPatch = ['ChannelListVoiceChannelContextMenu'];
    finalMenus = allMenus.filter((x) => menusToPatch.includes(x.default.displayName));
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
        global.MultiSelectedUsers = {};
      }

      onStart() {
        ZeresPluginLibrary.PluginUtilities.addStyle(config.info.name,
          `.UserSelected {
				background-color: #005fff87;
				border-radius: 5px;
			}
			
			.UserSelected:hover{
				background-color: #04a7ff87 !important;
			}
			
			.ToastCancelMove{
				background: red;
				margin-left: 10px;
				padding:5px;
				border-radius:5px;
			}
			
			.ToastCancelMove:hover{
				background: #ff5b5b;
			}
			
			`
        );
        this.PreviousGuildId = ZeresPluginLibrary.DiscordModules.SelectedGuildStore.getGuildId();
        global.MultiSelectedUsers = {};
        this.promises = {
          state: {
            cancelled: false
          },
          cancel() {
            this.state.cancelled = true;
          },
        };
        this.patchUserContextMenu(this.promises.state);

        this.unpatch = Patcher.after(ZeresPluginLibrary.WebpackModules.getByDisplayName("VoiceUser").prototype, "render", (r, __, e) => {
          //Check user is selected
          if (MultiSelectedUsers[r.props.user.id] != undefined) {
            if (e.props.children.props.className.includes("UserSelected") == false) {
              e.props.children.props.className += " UserSelected";
            }
          } else {
            e.props.children.props.className = e.props.children.props.className.replace("(\s|^)UserSelected", "");
          }
          return (r, __, e);
        });

        this.moveTimeoutTime = 200;
        document.addEventListener('click', this.UserClickEvent, true);
        document.addEventListener('contextmenu', this.UserRightClick, true);
      }

      onSwitch() {
        let selectedguildid = ZeresPluginLibrary.DiscordModules.SelectedGuildStore.getGuildId();
        if (selectedguildid != this.PreviousGuildId) {
          this.PreviousGuildId = selectedguildid;
          global.MultiSelectedUsers = {};
        }
      }

      onStop() {
        this.promises.cancel();
        this.unbindContextMenus();
        ZeresPluginLibrary.PluginUtilities.removeStyle(config.info.name);
        this.unpatch();
        let tmp = Object.values(MultiSelectedUsers);
        global.MultiSelectedUsers = {};
        for (let index = 0; index < tmp.length; index++) {
          if (tmp[index].Node != undefined) {
            tmp[index].Node.forceUpdate();
          }
        }
        document.removeEventListener('click', this.UserClickEvent, true);
        document.removeEventListener('contextmenu', this.UserRightClick, true);
      }

      canMoveInChannel(chan) {
        return ZeresPluginLibrary.DiscordModules.Permissions.can(ZeresPluginLibrary.DiscordModules.DiscordPermissions.MOVE_MEMBERS, ZeresPluginLibrary.DiscordAPI.currentUser, chan);
      }

      UserRightClick(e){
        //Nothing to check
        if (e.path.length == 0){
          return;
        }

        let IsVoiceChannel = false;
        for (let index = 0; index < Math.min(e.path.length, 5); index++) {
          if (e.path[index].nodeName == "A" && e.path[index].getAttribute("aria-label") != null && e.path[index].innerText != null && e.path[index].getAttribute("aria-label").includes("(voice channel)")) {
            IsVoiceChannel = true;
            break;
          }
        }

        if (IsVoiceChannel && finalMenus.length == 0){
          //Ensure the menus are patched
          allMenus = BdApi.findAllModules((x) => x && x.default && x.default.displayName && x.default.displayName.includes('ContextMenu'));
          menusToPatch = ['ChannelListVoiceChannelContextMenu'];
          finalMenus = allMenus.filter((x) => menusToPatch.includes(x.default.displayName));
          const multiselect = BdApi.Plugins.get("MultiSelect").instance;


          multiselect.patchUserContextMenu(multiselect.promises.state);
        }
      }

      UserClickEvent(e) {
        //Nothing to check
        if (e.path.length == 0 || (e.ctrlKey || e.shiftKey) == false) {
          return;
        }

        let IsVoiceChannel = false;
        for (let index = 0; index < Math.min(e.path.length, 5); index++) {
          if (e.path[index].nodeName == "A" && e.path[index].getAttribute("aria-label") != null && e.path[index].innerText != null && e.path[index].getAttribute("aria-label").includes("(voice channel)")) {
            IsVoiceChannel = true;
            break;
          }
        }

        if (IsVoiceChannel) {
          //Voice channel selected
          e.stopPropagation();

          let Found = false;
          let channelparentdom = e.path[0];
          let containerclass = ZeresPluginLibrary.DiscordClasses.ChannelList.containerDefault.value;

          for (let index = 0; index < e.path.length; index++) {
            if (e.path[index].classList == undefined) {
              continue;
            }
            if (e.path[index].className.includes(containerclass)) {
              Found = true;
              channelparentdom = e.path[index];
              break;
            }
          }

          if (Found && channelparentdom.children.length > 1 && channelparentdom.children[1].className != null && channelparentdom.children[1].getAttribute('role') == 'group') {
            let VoiceUserList = channelparentdom.children[1];
            let UsersList = [];
            let UserSelectedPresent = false;

            for (let index = 0; index < VoiceUserList.children.length; index++) {
              var ownerinst = ZeresPluginLibrary.ReactTools.getOwnerInstance(VoiceUserList.children[index]);
              if (ownerinst != undefined && ownerinst.props.user != undefined) {
                UsersList.push({
                  user: ownerinst.props.user,
                  Node: ownerinst
                });

                if (global.MultiSelectedUsers[ownerinst.props.user.id] != undefined) {
                  UserSelectedPresent = true;
                }
              }
            }

            //Update all users in vc
            if (UserSelectedPresent) {
              for (let index = 0; index < UsersList.length; index++) {
                delete global.MultiSelectedUsers[UsersList[index].user.id];
                if (UsersList[index].Node != undefined) {
                  UsersList[index].Node.forceUpdate();
                }
              }
            } else {
              for (let index = 0; index < UsersList.length; index++) {
                global.MultiSelectedUsers[UsersList[index].user.id] = UsersList[index];
                if (UsersList[index].Node != undefined) {
                  UsersList[index].Node.forceUpdate()
                }
              }
            }


          }


        } else {
          let IsVoiceUser = false;
          let UserDom = e.path[0];
          let Found = false;
          for (let index = 0; index < e.path.length; index++) {
            if (e.path[index].classList == undefined) {
              continue;
            }
            e.path[index].classList.forEach(classitem => {
              if (classitem.includes("voiceUser")) {
                IsVoiceUser = true;
              } else if (IsVoiceUser && classitem.includes("draggable")) {
                UserDom = e.path[index];
                Found = true;
              }
            });
            if (Found) {
              break;
            }
          }

          if ((e.ctrlKey || e.shiftKey) && IsVoiceUser) {
            e.stopPropagation();

            let Treeitem = ZeresPluginLibrary.ReactTools.getReactInstance(UserDom);
            let ClickedUser = null;
            let overloadcount = 0;

            //perform tree traversal -- cap at 1000 loops to prevent recursive
            while (ClickedUser == null && Treeitem != null && overloadcount < 1000) {
              if (Treeitem.memoizedProps != undefined && Treeitem.memoizedProps.user != undefined) {
                ClickedUser = Treeitem.memoizedProps.user;
              } else {
                Treeitem = Treeitem.child;
              }
              overloadcount++;
            }

            //No user
            if (ClickedUser == null) {
              return;
            }

            if (global.MultiSelectedUsers[ClickedUser.id] != undefined) {
              var tempnode = null
              if (global.MultiSelectedUsers[ClickedUser.id].Node != undefined) {
                tempnode = global.MultiSelectedUsers[ClickedUser.id].Node;
              }
              delete global.MultiSelectedUsers[ClickedUser.id];
              if (tempnode != null)
                tempnode.forceUpdate();
            } else {
              var ownerinst = ZeresPluginLibrary.ReactTools.getOwnerInstance(UserDom);
              global.MultiSelectedUsers[ClickedUser.id] = {
                user: ClickedUser,
                Node: ownerinst
              };
              if (ownerinst != undefined) {
                ownerinst.forceUpdate()
              }
            }
          }
        }


      }

      UserOnVoiceChannelInGuild(userid, guildid) {
        if (BdApi.findModuleByProps('getVoiceStatesForChannel').getAllVoiceStates()[guildid] != undefined) {
          let tmplist = Object.values(BdApi.findModuleByProps('getVoiceStatesForChannel').getAllVoiceStates()[guildid]);
          for (let index = 0; index < tmplist.length; index++) {
            if (tmplist[index].userId == userid) {
              return tmplist[index].channelId; //return channel
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
                  children: [{
                    $$typeof: Symbol.for('react.element'),
                    key: null,
                    props: {
                      action: () => {
                        ContextMenuActions.closeContextMenu();
                        const recipients = Object.values(global.MultiSelectedUsers);
                        global.MultiSelectedUsers = {};
                        let userIDX = 0;
                        let CancelMove = false;
                        let ToastItem = document.createElement("div")
                        ToastItem.className = "toast";
                        let ToastText = document.createElement("div");
                        ToastText.className = "toast-text";
                        let CounterSpan = null;
                        ToastText.innerHTML = "Moved ";
                        CounterSpan = document.createElement("span");
                        CounterSpan.innerText = 0;
                        ToastText.appendChild(CounterSpan);
                        ToastText.appendChild(document.createTextNode(" of " + recipients.length));
                        ToastItem.appendChild(ToastText);
                        ZeresPluginLibrary.Toasts.ensureContainer();
                        let ToastButton = document.createElement("div");
                        ToastButton.className = "ToastCancelMove";
                        ToastButton.innerText = "Cancel";
                        ToastButton.onclick = () => {
                          CancelMove = true;
                          ToastText.innerText = "Cancelling";
                        }
                        ToastItem.appendChild(ToastButton);

                        document.querySelector(".toasts").appendChild(ToastItem);

                        //loop
                        const timeoutFunc = () => {
                          if (CancelMove) {
                            ToastText.innerText = "Cancelled";

                            //readd users that haven't moved yet
                            for (let index = userIDX; index < recipients.length; index++) {
                              if (global.MultiSelectedUsers[recipients[userIDX].user.id] == undefined) {
                                global.MultiSelectedUsers[recipients[userIDX].user.id] = recipients[userIDX];
                              }
                            }

                            ToastItem.classList.add("closing");
                            setTimeout(() => {
                              ToastItem.remove();
                              if (!document.querySelectorAll(".toasts .toast").length) document.querySelector(".toasts").remove();
                            }, 300);

                            return;
                          }


                          if (recipients[userIDX].Node != undefined) {
                            recipients[userIDX].Node.forceUpdate();
                          }


                          //Skip users that aren't in a voice channel anymore or are already in it
                          let UserInVoice = this.UserOnVoiceChannelInGuild(recipients[userIDX].user.id, this.PreviousGuildId);
                          while (UserInVoice == false || UserInVoice == props.channel.id) {

                            //refresh users that didn't move
                            if (recipients[userIDX].Node != undefined) {
                              recipients[userIDX].Node.forceUpdate();
                            }
                            userIDX++;
                            //Stop function
                            if (userIDX >= recipients.length) {
                              ToastItem.classList.add("closing");
                              setTimeout(() => {
                                ToastItem.remove();
                                if (!document.querySelectorAll(".toasts .toast").length) document.querySelector(".toasts").remove();
                              }, 300);
                              return;
                            }
                            UserInVoice = this.UserOnVoiceChannelInGuild(recipients[userIDX].user.id, this.PreviousGuildId);
                          }

                          ZeresPluginLibrary.DiscordModules.APIModule.patch({
                              url: ZeresPluginLibrary.DiscordModules.DiscordConstants.Endpoints.GUILD_MEMBER(props.guild.id, recipients[userIDX].user.id),
                              body: {
                                channel_id: props.channel.id
                              }
                            })
                            .then(e => {
                              if (e.status === 200 || e.status === 204) {
                                userIDX++;

                                if (CounterSpan != undefined) {
                                  CounterSpan.innerText = userIDX;
                                }
                                if (userIDX < recipients.length && this.moveTimeoutTime < 800) {
                                  setTimeout(() => timeoutFunc(), this.moveTimeoutTime);
                                } else {
                                  ToastItem.classList.add("closing");
                                  setTimeout(() => {
                                    ToastItem.remove();
                                    if (!document.querySelectorAll(".toasts .toast").length) document.querySelector(".toasts").remove();
                                  }, 300);
                                }
                              }
                            })
                            .catch(e => {
                              this.moveTimeoutTime += 50;
                              ZeresPluginLibrary.Logger.warn(this.getName(), `Rate limited, new timeout ${this.moveTimeoutTime}`);
                              if (this.moveTimeoutTime < 800) setTimeout(() => timeoutFunc(), this.moveTimeoutTime);
                              else {
                                ToastItem.classList.add("closing");
                                setTimeout(() => {
                                  ToastItem.remove();
                                  if (!document.querySelectorAll(".toasts .toast").length) document.querySelector(".toasts").remove();
                                }, 300);
                              }
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
                  }],
                },
                ref: null,
                type: MenuGroup,
                _owner: null,
              };
              if (Array.isArray(original)){
                original.splice(1, 0, newOne);
              }
              else {
                retVal.props.children[0].props.children = [original, newOne];
              };
            })
          );
        });

        const menus = document.querySelectorAll('.layer-v9HyYc');
        menus.forEach((menu) => {
          // console.log(menu);
          if (!menu) return;
          const {
            stateNode
          } = menu.__reactEventHandlers$.children._owner;
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

      get[Symbol.toStringTag]() {
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

  return !global.ZeresPluginLibrary ?
    class {
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
            children: [TextElement({
              color: TextElement.Colors.PRIMARY,
              children: [`${content} Please click Download Now to install it.`]
            })],
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

      get[Symbol.toStringTag]() {
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
    } :
    buildPlugin(global.ZeresPluginLibrary.buildPlugin(config));
})();

/* @end@ */
