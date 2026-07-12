export {
  discoverProjects,
  getProjectRoots,
  getUserRoots,
  type DiscoveredProject,
  type RootSource,
} from "./discover";
export {
  addProjectRoot,
  deleteProjectRoot,
  InvalidPathError,
  DuplicateRootError,
  RootNotFoundError,
} from "./roots";
