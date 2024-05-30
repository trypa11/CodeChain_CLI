#!/usr/bin/env node

import { ethers } from 'ethers';
import { create } from 'kubo-rpc-client';
import { Command } from 'commander';
import inquirer from 'inquirer';
const CodeChain = JSON.parse(readFileSync('./artifacts/contracts/CodeChain.sol/CodeChain.json', 'utf8'));
import { readdirSync, statSync, readFileSync,writeFileSync} from 'fs';
import { join, relative, sep, basename } from 'path';
import JSZip from 'jszip';
import figlet from 'figlet';

const program = new Command();
const ipfsClient = create({ host: '127.0.0.1', port: 5001, protocol: 'http' });
const URL_blchain = 'http://127.0.0.1:8545/';
let provider;
let contract;
let account;
let CommitIPFSHash;
let wallet;
let signer;



async function authenticate() {
    await figletCodeChain();
    const { privateKey } = await inquirer.prompt([
        {
            type: 'input',
            name: 'privateKey',
            message: 'Enter your private key:',
            mask: '*'
        }
    ]);
    provider = new ethers.JsonRpcProvider(URL_blchain);
    wallet = new ethers.Wallet(privateKey, provider);
    account = wallet.address;
    console.log('Authenticated with account:', account);
    signer = wallet.connect(provider);
    contract = new ethers.Contract("0x5FbDB2315678afecb367f032d93F642f64180aa3", CodeChain.abi, signer);
}
const handleInit = async () => {
    await authenticate();
    const { repoName,descr } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository'
        }
        
    ]);
    try {
        await contract.createRepository(repoName);
        console.log('Created repository:', repoName);
    } catch (error) {
        console.error('Error initializing contract:', error);
    }
};

const handleUpload = async () => {
    const { folderPath } = await inquirer.prompt([
        {
            type: 'input',
            name: 'folderPath',
            message: 'Enter the local path of the folder to upload:'
        }
    ]);
    //create a parent directory with unique name
    const parent = Math.random().toString(36).substring(7);
    await ipfsClient.files.mkdir(`/${parent}`);

    // Read the directory recursively
    const readDirectory = (directoryPath) => {
        const files = readdirSync(directoryPath);
        const fileArray = [];

        files.forEach((file) => {
            const filePath = join(directoryPath, file);
            const stat = statSync(filePath);

            if (stat.isFile()) {
                fileArray.push(filePath);
            } else if (stat.isDirectory()) {
                fileArray.push(...readDirectory(filePath));
            }
        });

        return fileArray;
    };

    const filesArray = readDirectory(folderPath);

    // Structure to maintain the directory hierarchy
    const directoryStructure = filesArray.reduce((acc, file) => {
        const relativePath = relative(folderPath, file);
        const pathParts = relativePath.split(sep);
        pathParts.pop(); // remove the file name
        acc[relativePath] = pathParts.join('/');
        return acc;
    }, {});

    // Upload each file to IPFS
    for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const relativePath = relative(folderPath, file);
        const dirPath = directoryStructure[relativePath];
    
        // Add the file to IPFS under the correct directory
        const content = readFileSync(file);
        await ipfsClient.files.write(`/${parent}/${dirPath}/${basename(file)}`, content, { create: true, parents: true });
    }
    
    // Get the IPFS hash of the local parent directory
    const ipfsHash = await ipfsClient.files.stat(`/${parent}`);
    CommitIPFSHash = ipfsHash.cid.toString();
    
    console.log('IPFS Hash:', ipfsHash.cid.toString());
};

const commit = async () => {
    await authenticate();
    await handleUpload();
    const { repoName, branchName, message } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'branchName',
            message: 'Enter the name of the branch:'
        },
        {
            type: 'input',
            name: 'message',
            message: 'Enter the commit message:'
        }
    ]);
    try {
        //i want to check if the commit hash is empty or not
        if (CommitIPFSHash == null) {
            console.log('No files to commit');
            return;
        }
        await contract.commit(repoName, branchName, message, CommitIPFSHash);
        console.log('Commit made to repository:', repoName);
    } catch (error) {
        console.error('Error making commit:', error);
    }
};

const publish = async () => {
    await authenticate();
    const repoName = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        }
    ]);
    try {
        await contract.getRepositoryPublic(repoName);
    } catch (error) {
        console.error('Error getting public repository:', error);
    }
};
const joinAsCollaborator = async () => {
    await authenticate();
    const { repoName, etherAmount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'etherAmount',
            message: 'Enter the amount of ether to send:'
        }
    ]);
    if (!repoName) {
        console.error('Repository name is required');
        return;
    }
    if (!etherAmount) {
        console.error('Ether amount is required');
        return;
    }


    try {
        const signer = wallet.connect(provider);

        const txOptions = {
            value: ethers.parseEther(etherAmount)
        };

        const tx = await contract.connect(signer).addCollaborator(repoName, txOptions);
        await tx.wait();

        console.log('Joined as collaborator for repository:', repoName);
    } catch (error) {
        console.error('Error joining as collaborator:', error);
    }
};
const getLatestIpfsHash = async () => {
    await authenticate();
    const { repoName, branchName } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'branchName',
            message: 'Enter the name of the branch:'
        }
    ]);
    const ipfsHash = await contract.getLatestIpfsHash(repoName, branchName);
    console.log('Latest IPFS hash:', ipfsHash);
};
const createBranch = async () => {
    await authenticate();
    const { repoName, branchName } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'branchName',
            message: 'Enter the name of the branch:'
        }
    ]);
    try {
        await contract.createBranch(repoName, branchName);
        console.log('Created branch for repository:', repoName);
    } catch (error) {
        console.error('Error creating branch:', error);
    }
};
const createPullRequest = async () => {
    await authenticate();
    const { repoName, fromBranch, toBranch} = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'fromBranch',
            message: 'Enter the name of the from branch:'
        },
        {
            type: 'input',
            name: 'toBranch',
            message: 'Enter the name of the to branch:'
        },
    ]);
    try {
        await contract.createPullRequest(repoName, fromBranch, toBranch);
        console.log('Created pull request for repository:', repoName);
    } catch (error) {
        console.error('Error creating pull request:', error);
    }
};

const approvePullRequest = async () => {
    await authenticate();
    const { repoName, pullRequestId } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'pullRequestId',
            message: 'Enter the pull request id:'
        }
    ]);
    try {
        await contract.approvePullRequest(repoName, pullRequestId);
        console.log('Approved pull request for repository:', repoName);
    } catch (error) {
        console.error('Error approving pull request:', error);
    }
};

const clone = async () => {
    await authenticate();

    try {
        const { repoName, branchName } = await inquirer.prompt([
            {
                type: 'input',
                name: 'repoName',
                message: 'Enter the name of the repository:'
            },
            {
                type: 'input',
                name: 'branchName',
                message: 'Enter the name of the branch:'
            }
        ]);

        if (!repoName) {
            console.error('Repository name is required');
            return;
        }

        if (!branchName) {
            console.error('Branch name is required');
            return;
        }

        const hash = await contract.getLatestIpfsHash(repoName, branchName);
        console.log('Latest commit IPFS hash:', hash);

        const zip = new JSZip();
        const folder = zip.folder(repoName);
        await downloadDir(hash, folder);

        const content = await zip.generateAsync({ type: 'nodebuffer' });
        writeFileSync(`${repoName}.zip`, content);
        console.log(`Repository ${repoName} has been successfully downloaded and saved as ${repoName}.zip`);

    } catch (error) {
        console.error('Error downloading folder:', error);
    }
};

const downloadDir = async (hash, zipFolder) => {
    const files = await ipfsClient.ls(hash);

    for await (const file of files) {
        if (file.type === 'file') {
            const fileStream = ipfsClient.cat(file.cid);
            const chunks = [];
            for await (const chunk of fileStream) {
                chunks.push(chunk);
            }
            const fileData = Buffer.concat(chunks);
            zipFolder.file(file.name, fileData);
        } else if (file.type === 'dir') {
            const subFolder = zipFolder.folder(file.name);
            await downloadDir(file.cid, subFolder);
        }
    }
};

const getCommit = async () => {
    await authenticate();
    const { repoName, commitId } = await inquirer.prompt([
        {   
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'commitId',
            message: 'Enter the commit id:'
        }
    ]);
    try {
        const commit = await contract.getCommit(repoName, commitId);
        console.log('Commit details:', commit);
    } catch (error) {
        console.error('Error fetching commit details:', error);
    }
};
const getBranch = async () => {
    await authenticate();
    const { repoName, branchName } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'branchName',
            message: 'Enter the name of the branch:'
        }
    ]);
    try {
        const branch = await contract.getBranchInfo(repoName, branchName);
        console.log('Branch details:', branch);
    } catch (error) {
        console.error('Error fetching branch details:', error);
    }
};
const getRepositoryInfo = async () => {
    await authenticate();
    const { repoName } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        }
    ]);
    try {
        const repoDetails = await contract.getRepositoryInfo(repoName);
        console.log('Repository details:', repoDetails);
    } catch (error) {
        console.error('Error fetching repository details:', error);
    }
};
const getPullRequest = async () => {
    await authenticate();
    const { repoName, pullRequestId } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        },
        {
            type: 'input',
            name: 'pullRequestId',
            message: 'Enter the pull request id:'
        }
    ]);
    try {
        const pullRequest = await contract.getPullRequestInfo(repoName, pullRequestId);
        console.log('Pull request details:', pullRequest);
    } catch (error) {
        console.error('Error fetching pull request details:', error);
    }
};    
const getActivePullRequests = async () => {
    await authenticate();
    const { repoName } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository:'
        }
    ]);
    try {
        const pullRequests = await contract.getActivePullRequests(repoName);
        console.log('Active pull requests:', pullRequests);
    } catch (error) {
        console.error('Error fetching active pull requests:', error);
    }
};
const getBalance = async () => {
    await authenticate();
    try {   
        const balance = await provider.getBalance(account);
        console.log('Balance:', balance);
    } catch (error) {
        console.error('Error fetching balance:', error);
    }
};
//create a function that set the description of the repository
const setRepoDescription = async () => {
    await authenticate();
    const { repoName, descr } = await inquirer.prompt([
        {
            type: 'input',
            name: 'repoName',
            message: 'Enter the name of the repository'
        },
        {
            type: 'input',
            name: 'descr',
            message: 'Enter the description of the repository'
        }
    ]);
    try {
        await contract.setRepoDescription(repoName, descr);
        console.log('Description set for repository:', repoName);
    } catch (error) {
        console.error('Error setting description:', error);
    }
};
//create a function that use figlet for codechain
const figletCodeChain = async () => {
    await figlet('CodeChain',{ font: 'Doom' }, (err, data) => {
        if (err) {
            console.log('Error loading figlet');
            return;
        }
        console.log(data);
    }
    );
};

const logoCodeChain = figlet.textSync('CodeChain', {
    font: 'Doom',
    horizontalLayout: 'default',
    verticalLayout: 'default'
});

console.log(logoCodeChain);

program 
    .version('0.0.1')
    .name('CodeChain')
    .description('CodeChain:A decentralized code collaboration platform');



program
    .command('authenticate')
    .description('Authenticate user with private key')
    .action(authenticate);

program
    .command('init')
    .description('Initialize a new repository')
    .action(handleInit);

program
    .command('upload')
    .description('Upload a folder to IPFS')
    .action(handleUpload);

program
    .command('commit')
    .description('Commit changes to a repository')
    .action(commit);
program
    .command('publish')
    .description('Publish a repository')
    .action(publish);
program
    .command('join')
    .description('Join as a collaborator for a repository')
    .action(joinAsCollaborator);
program
    .command('hash')
    .description('Get the latest IPFS hash for a repository')
    .action(getLatestIpfsHash);
program
    .command('branch')
    .description('Create a new branch for a repository')
    .action(createBranch);
program
    .command('pull-request')
    .description('Create a new pull request')
    .action(createPullRequest);
program
    .command('approve')
    .description('Approve a pull request')
    .action(approvePullRequest);
program
    .command('clone')
    .description('Clone a repository')
    .action(clone);
program
    .command('balance')
    .description('Get balance')
    .action(getBalance);
program
    .command('repo-descr')
    .description('Set the description of a repository')
    .action(setRepoDescription);
program
    .command('get-commit')
    .description('Get commit details')
    .action(getCommit);
program
    .command('get-branch')
    .description('Get branch details')
    .action(getBranch);
program
    .command('get-repo')
    .description('Get repository details')
    .action(getRepositoryInfo);
program
    .command('get-pull-request')
    .description('Get pull request details')
    .action(getPullRequest);
program
    .command('get-active-pull-requests')
    .description('Get active pull requests for a repository')
    .action(getActivePullRequests);


if (!process.argv.slice(1).length) {
    program.outputHelp();
}

program.parse(process.argv);