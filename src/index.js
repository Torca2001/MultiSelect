module.exports = (Plugin, Library) => {
    const {
        DiscordModules: {
            React,
            DiscordConstants
        },
        ReactTools,
        DiscordSelectors,
        Utilities,
        WebpackModules,
        PluginUtilities,
        DiscordModules,
        ContextMenu,
        Patcher,
        Logger,
        Toasts
    } = Api;
    const voiceStates = WebpackModules.getByProps("getVoiceStatesForChannel");
    const voiceUserComponent = WebpackModules.findByDisplayName('VoiceUser');
    const voiceUserSelector = BdApi.findModuleByProps("voiceUser").voiceUser;
    const voiceUsersRender = ZLibrary.WebpackModules.getByPrototypes("renderPrioritySpeaker");
    const channelItemComponent = WebpackModules.getModule(m => Object(m.default).displayName === "ChannelItem");
    //renderVoiceUsers

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

        async PatchAll() {
            this.contextMenuPatches.push(BdApi.ContextMenu.patch("channel-context", this.channelMenuPatch.bind(this)));
            
            Patcher.after(voiceUsersRender.prototype, "render", this.voiceUserRenderPatch.bind(this));

            return;
            Patcher.after(voiceUserComponent.prototype, "render", this.voiceUserRenderPatch.bind(this));
            Patcher.after(channelItemComponent, "default", this.ChannelItemPatch.bind(this));

            //Force update
            document.querySelectorAll(DiscordSelectors.ChannelList.containerDefault).forEach(e => {
                ReactTools.getOwnerInstance(e).forceUpdate();
            });
        }

        onStop() {
            this.cancelled = true;
            PluginUtilities.removeStyle(config.info.name);
            Patcher.unpatchAll();

            for (let unpatch of this.contextMenuPatches) {
                try {
                    unpatch();
                } catch (e) {
                    //Do nothing
                }
            }
        }

        channelMenuPatch(retVal, props) {
            if (props.channel.type != 2) return;

            if (props.guild.id != this.guild_id) {
                this.guild_id = props.guild.id;
                this.selectedUsers.clear();
            }

            if (this.selectedUsers.size <= 0 || !this.canMoveInChannel(props.channel.id)) {
                return;
            };

            const separator = BdApi.ContextMenu.buildItem({
                type: "separator"
            });

            const newItem = BdApi.ContextMenu.buildItem({
                label: `Move ${this.selectedUsers.size} here`,
                action: () => {
                    this.moveSelectedUsers(this.guild_id, props.channel.id);
                    this.selectedUsers.clear();
                }
            });

            retVal.props.children.push(separator);
            retVal.props.children.push(newItem);

            return retVal;
        }

        moveSelectedUsers(guildID, channelID) {
            let wait = 80;
            if (!isNaN(this.settings.moveInterval) && this.settings.moveInterval > 10) {
                wait = Number(this.settings.moveInterval);
            }
            let giveup = wait + 750;

            let users = Array.from(this.selectedUsers);
            let i = 0;

            Toasts.info('Moving ' + users.length + " users");
            let moveInterval = setInterval(() => {
                DiscordModules.GuildActions.setChannel(guildID, users[i], channelID);
                i++;
                if (i >= users.length) {
                    clearInterval(moveInterval);
                    Toasts.info("Moving complete");
                }
            }, wait);

            

            /*
            let moveUser = () => {
                //DiscordModules.GuildActions.setChannel(guildID, users[i])
                DiscordModules.APIModule.patch({
                    url: DiscordModules.DiscordConstants.Endpoints.GUILD_MEMBER(guildID, users[i]),
                    body: {
                        channel_id: channelID
                    }
                }).then((e) => {
                    if (e.status === 200 || e.status === 204) {
                        i++;
                    }

                    if (i < users.length && wait < giveup) {
                        setTimeout(moveUser, wait);
                    } else {
                        Toasts.info("Moving complete");
                    }
                }).catch((e) => {
                    wait += 50;
                    Toasts.error("Rate limited");
                    if (wait < giveup && e.status !== 403) {
                        setTimeout(moveUser, wait);
                    } else {
                        Toasts.error('Error stopping move');
                    }
                });
            }

            moveUser();
            */
        }

        voiceUserRenderPatch(org, args, resp) {
            let oldfunc = resp.props.onClick;
            resp.props.onClick = (e) => {
                if (e.ctrlKey || e.shiftKey) {

                    if (org.props.guildId != this.guild_id) {
                        this.guild_id = org.props.guildId;
                        this.selectedUsers.clear();
                    }

                    if (this.selectedUsers.has(org.props.user.id)) {
                        this.selectedUsers.delete(org.props.user.id);
                    } else {
                        this.selectedUsers.add(org.props.user.id);
                    }

                    let current = e.target;
                    while (current != undefined && current.classList) {
                        if (current.classList.contains(voiceUserSelector)) {
                            current.classList.toggle('selectedVoiceUser', this.selectedUsers.has(org.props.user.id))
                            break;
                        }
                        current = current.parentNode;
                    }
                } else {
                    oldfunc(e);
                }
            };

            resp.props.onClick = resp.props.onClick.bind(this);
            if (this.selectedUsers.has(org.props.user.id)) {
                resp.props.className += " selectedVoiceUser";
            }
        }

        ChannelItemPatch(_, [props], ret) {
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
                if ((e.shiftKey || e.ctrlKey) && e.button == 0) {
                    e.stopPropagation();
                    e.preventDefault();

                    if (props.channel.guild_id != this.guild_id) {
                        this.guild_id = props.channel.guild_id;
                        this.selectedUsers.clear();
                    }

                    let voicestates = Object.keys(voiceStates.getVoiceStatesForChannel(props.channel.id));
                    let alreadySelected = false;
                    for (const id of voicestates) {
                        if (this.selectedUsers.has(id)) {
                            alreadySelected = true;
                            break;
                        }
                    }

                    if (alreadySelected) {
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
                    while (current != undefined && current.classList) {
                        if (current.classList.contains(defaultContainer)) {
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
                if (normalCache) return {
                    type: "normal",
                    module: normalCache
                };
            }

            {
                const webpackId = Object.keys(WebpackModules.require.m).find(id => nestedFilter(WebpackModules.require.m[id]));
                const nestedCache = webpackId !== undefined && WebpackModules.getByIndex(webpackId);
                if (nestedCache) return {
                    type: "nested",
                    module: nestedCache
                };
            }

            return new Promise((resolve) => {
                const listener = (exports, module) => {
                    const normal = normalFilter(exports);
                    const nested = nestedFilter(module);

                    if (!nested && !normal) return;

                    resolve({
                        type: normal ? "normal" : "nested",
                        module: exports
                    });
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
