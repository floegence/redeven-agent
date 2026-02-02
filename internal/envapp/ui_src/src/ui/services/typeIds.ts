// Flowersec RPC type_id list shared by the agent and the Env App UI.

export const TypeIds = {
  FsList: 1001,
  FsReadFile: 1002,
  FsWriteFile: 1003,
  FsRename: 1004,
  FsCopy: 1005,
  FsDelete: 1006,
  FsGetHome: 1010,

  TerminalSessionCreate: 2001,
  TerminalSessionList: 2002,
  TerminalSessionAttach: 2003,
  TerminalOutput: 2004, // notify (agent -> client)
  TerminalResize: 2005, // notify (client -> agent)
  TerminalInput: 2006, // notify (client -> agent)
  TerminalHistory: 2007,
  TerminalClear: 2008,
  TerminalSessionDelete: 2009,
  TerminalNameUpdate: 2010, // notify (agent -> client): session name / cwd updates
  TerminalSessionStats: 2011, // active session history buffer stats

  SysMonitor: 3001,
} as const;
