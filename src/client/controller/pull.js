// *****************************************************
// Pull Request Controller
//
// tmpl: pull.html
// path: /:user/:repo/pull/:number
// resolve: repo, pull 
// *****************************************************

module.controller('PullCtrl', ['$scope', '$rootScope', '$stateParams', '$HUB', '$RPC', 'repo', 'pull', 'socket', 'Issue',
    function($scope, $rootScope, $stateParams, $HUB, $RPC, repo, pull, socket, Issue) {

        // get the repo
        $scope.repo = repo;

        // get the pull request
        $scope.pull = pull;
        $scope.base = $scope.pull.value.base.sha;
        $scope.head = $scope.pull.value.head.sha;

        // file reference
        $scope.reference = { sha: null, ref: null, type: null, disabled: null };

        // note: work around for strage angular binding issue
        $scope.update = function(reference) {
            $scope.reference = reference;
        };

        // get the commit
        $scope.comm = $HUB.call('repos', 'getCommit', {
            user: $stateParams.user,
            repo: $stateParams.repo,
            sha: $scope.pull.value.head.sha
        });

        // get the commits
        $scope.commits = $HUB.call('pullRequests', 'getCommits', {
            user: $stateParams.user,
            repo: $stateParams.repo,
            number: $stateParams.number,
        });

        // get the base commits
        $scope.baseCommits = $HUB.call('repos', 'getCommits', {
            user: $stateParams.user,
            repo: $stateParams.repo,
            sha: $scope.pull.value.base.sha,
            per_page: 15
        });

        // get the statuses
        $scope.stat = $HUB.call('statuses', 'get', {
            user: $stateParams.user,
            repo: $stateParams.repo,
            sha: $scope.pull.value.head.sha,
        });

        $scope.files = $HUB.wrap('pullRequests', 'getFiles', {
            user: $stateParams.user,
            repo: $stateParams.repo,
            number: $stateParams.number
        });

        // get the tree (for the file browser)
        $scope.tree = $HUB.call('gitdata', 'getTree', {
            user: $stateParams.user,
            repo: $stateParams.repo,
            sha: $scope.pull.value.head.sha
        });


        //
        // Actions
        //

        $scope.compComm = function(base) {

            if($scope.base!==base && $scope.head!==base) {

                $scope.base = base;

                $HUB.wrap('repos', 'compareCommits', {
                    user: $stateParams.user,
                    repo: $stateParams.repo,
                    head: $scope.head,
                    base: base
                    
                }, function(err, res) {
                    if(!err) {
                        $scope.files.value = res.value.files;
                    }
                });
            }
        };

        $scope.merge = function() {
            $HUB.call('pullRequests', 'merge', {
                user: $stateParams.user,
                repo: $stateParams.repo,
                number: $stateParams.number
            }, function(err, res) {
                if (!err && res.value.merged) {

                    // instead of doing this, can we just 
                    // set pull.merged to true??
                    $scope.pull = $HUB.call('pullRequests', 'get', {
                        user: $stateParams.user,
                        repo: $stateParams.repo,
                        number: $stateParams.number
                    });
                }
            });
        };

        $scope.refreshStargazers = function() {
            $RPC.call('star', 'all', {
                repo: $scope.repo.value.id,
                comm: $scope.pull.value.head.sha
            }, function(err, stargazers) {
                $scope.stargazers = stargazers;
                $RPC.call('star', 'get', {
                    // repo uuid
                    repo: $scope.repo.value.id,
                    // comm uuid
                    comm: $scope.pull.value.head.sha
                }, function(err, data) {
                    $scope.starred = data.value !== '';
                });
            });
        };

        $scope.refreshStargazers();

        $scope.star = function() {
            $scope.vote = $RPC.call('star', 'set', {
                repo: $stateParams.repo,
                user: $stateParams.user,
                number: $stateParams.number,
                repo_uuid: $scope.repo.value.id,
                sha: $scope.pull.value.head.sha
            });
        };

        $scope.unstar = function() {
            $scope.vote = $RPC.call('star', 'rmv', {
                repo: $stateParams.repo,
                user: $stateParams.user,
                number: $stateParams.number,
                repo_uuid: $scope.repo.value.id,
                sha: $scope.pull.value.head.sha
            });
        };

        socket.on($stateParams.user + ':' + $stateParams.repo + ':pull-request-' + $stateParams.number + ':starred', function() {
            $scope.refreshStargazers();
        });

        socket.on($stateParams.user + ':' + $stateParams.repo + ':pull-request-' + $stateParams.number + ':unstarred', function() {
            $scope.refreshStargazers();
        });
    }
]);
