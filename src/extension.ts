import * as vscode from 'vscode';
import {Operation} from './operation';

let currentDirection: 'advance' | 'backup' = 'advance'; // Can be 'advance' or 'backup'
let isGoldActive = false;
let isSelectionModeActive = false; // Tracks if KP. anchor mode is active
let statusBarItem: vscode.StatusBarItem;

var inMarkMode: boolean = false;
var markHasMoved: boolean = false;

export function activate(context: vscode.ExtensionContext): void {
    let op = new Operation(),
        commandList: string[] = [
            "C-g",

            // Edit
            "C-k", "C-w", "M-w", "C-y", "C-x_C-o",
            "C-/", "C-j", "C-S_bs",

            // Navigation
            "C-l",
        ],
        cursorMoves: string[] = [
            "cursorUp", "cursorDown", "cursorLeft", "cursorRight",
            "cursorHome", "cursorEnd",
            "cursorWordLeft", "cursorWordRight",
            "cursorPageDown", "cursorPageUp",
            "cursorTop", "cursorBottom"
        ];

    commandList.forEach(commandName => {
        context.subscriptions.push(registerCommand(commandName, op));
    });

    cursorMoves.forEach(element => {
        context.subscriptions.push(vscode.commands.registerCommand(
            "emacs."+element, () => {
                if (inMarkMode) {
                    markHasMoved  = true;
                }
                vscode.commands.executeCommand(
                    inMarkMode ?
                    element+"Select" :
                    element
                );
            })
        )
    });

    initMarkMode(context);
    // 1. Setup Custom EDT Status Bar Display Widget
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Helper macro function to reset Gold Key status after a keypress executes
    function checkGold(): boolean {
        if (isGoldActive) {
            isGoldActive = false;
            updateStatusBar();
            return true;
        }
        return false;
    }

    // 2. Register Your Keyboard Layout Action Hooks
    context.subscriptions.push(
        // PF1 (Numpad /): Gold Key Toggle Switch
        vscode.commands.registerCommand('edtKeypad.gold', () => {
            isGoldActive = !isGoldActive;
            updateStatusBar();
        }),
        
        // KP4: Advance Direction State Mode Toggle / Gold Buffer Jump Bottom
        vscode.commands.registerCommand('edtKeypad.kp4', async () => {
            if (checkGold()) {
                const cmd = isSelectionModeActive ? 'cursorBottomSelect' : 'cursorBottom';
                await vscode.commands.executeCommand(cmd);
            } else {
                currentDirection = 'advance';
                updateStatusBar();
            }
        }),
        
        // KP5: Backup Direction State Mode Toggle / Gold Buffer Jump Top
        vscode.commands.registerCommand('edtKeypad.kp5', async () => {
            if (checkGold()) {
                const cmd = isSelectionModeActive ? 'cursorTopSelect' : 'cursorTop';
                await vscode.commands.executeCommand(cmd);
            } else {
                currentDirection = 'backup';
                updateStatusBar();
            }
        }),
        
        // KP0: Smart Line Scrolling (Bypasses Indentation for Strict Column 0 Navigation)
        vscode.commands.registerCommand('edtKeypad.kp0', async () => {
            if (checkGold()) {
                await vscode.commands.executeCommand('workbench.action.gotoLine');
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const pos = editor.selection.active;
            const stepDown = isSelectionModeActive ? ['cursorDownSelect', 'cursorLineStartSelect'] : ['cursorDown', 'cursorLineStart'];
            const snapHome = isSelectionModeActive ? 'cursorLineStartSelect' : 'cursorLineStart';
            const stepUp = isSelectionModeActive ? ['cursorUpSelect', 'cursorLineStartSelect'] : ['cursorUp', 'cursorLineStart'];
            
            if (currentDirection === 'advance') {
                if (pos.character === 0 && pos.line < editor.document.lineCount - 1) {
                    await vscode.commands.executeCommand('runCommands', { commands: stepDown });
                } else {
                    await vscode.commands.executeCommand(snapHome);
                }
            } else {
                if (pos.character === 0 && pos.line > 0) {
                    await vscode.commands.executeCommand('runCommands', { commands: stepUp });
                } else {
                    await vscode.commands.executeCommand(snapHome);
                }
            }
        }),
        
        // KP1: Word Forward (Start of Next Word) / Word Backward (Start of Previous Word)
        vscode.commands.registerCommand('edtKeypad.kp1', async () => {
            if (checkGold()) {
                await vscode.commands.executeCommand('editor.action.transformToUppercase');
                return;
            }
            if (currentDirection === 'advance') {
                const cmd = isSelectionModeActive ? 'cursorWordStartRightSelect' : 'cursorWordStartRight';
                await vscode.commands.executeCommand(cmd);
            } else {
                const cmd = isSelectionModeActive ? 'cursorWordLeftSelect' : 'cursorWordLeft';
                await vscode.commands.executeCommand(cmd);
            }
        }),
        
        // KP2: EOL Navigation (Context-Aware Line Ending Tracker)
        // Gold + KP2: Delete Next Word Right
        vscode.commands.registerCommand('edtKeypad.kp2', async () => {
            if (checkGold()) {
                await vscode.commands.executeCommand('deleteWordRight');
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const position = editor.selection.active;
            const currentLine = editor.document.lineAt(position.line);
            
            if (currentDirection === 'advance') {
                // Check if cursor is already at the end of the current line
                if (position.character >= currentLine.range.end.character) {
                    // Subsequent press: Drop down a line and snap to the next EOL
                    if (position.line < editor.document.lineCount - 1) {
                        const nextLineEnd = editor.document.lineAt(position.line + 1).range.end;
                        editor.selection = new vscode.Selection(nextLineEnd, nextLineEnd);
                    }
                } else {
                    // First press: Snap cleanly to the end of the current line
                    editor.selection = new vscode.Selection(currentLine.range.end, currentLine.range.end);
                }
            } else {
                // Backup Mode: Move up a line and snap cleanly to the previous EOL
                if (position.line > 0) {
                    const prevLineEnd = editor.document.lineAt(position.line - 1).range.end;
                    editor.selection = new vscode.Selection(prevLineEnd, prevLineEnd);
                }
            }
            
            // Selection Mode Anchor Integration: Expand highlight block if KP. is active
            if (isSelectionModeActive) {
                await vscode.commands.executeCommand('editor.action.selectFromAnchorToCursor');
            }
        }),
        
        // KP3: Character Right / Character Left Navigation
        vscode.commands.registerCommand('edtKeypad.kp3', async () => {
            if (checkGold()) {
                await vscode.commands.executeCommand('editor.action.transformToLowercase');
                return;
            }
            if (currentDirection === 'advance') {
                const cmd = isSelectionModeActive ? 'cursorRightSelect' : 'cursorRight';
                await vscode.commands.executeCommand(cmd);
            } else {
                const cmd = isSelectionModeActive ? 'cursorLeftSelect' : 'cursorLeft';
                await vscode.commands.executeCommand(cmd);
            }
        }),
        
        // KP6: Cut Selection Block Only (Safely ignores empty inputs) / Gold Paste Uncut
        vscode.commands.registerCommand('edtKeypad.kp6', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            if (checkGold()) {
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                return;
            }
            const selection = editor.selection;
            if (!selection.isEmpty) {
                const selectedText = editor.document.getText(selection);
                await vscode.env.clipboard.writeText(selectedText);
                await vscode.commands.executeCommand('deleteLeft');
                isSelectionModeActive = false; // Reset selection matrix flag upon successful cut
                await vscode.commands.executeCommand('cancelSelection');
            }
        }),
        
        // KP7: Scroll Page Down / Scroll Page Up Jump Actions
        vscode.commands.registerCommand('edtKeypad.kp7', async () => {
            checkGold();
            const cmd = (currentDirection === 'advance') ? 'cursorPageDown' : 'cursorPageUp';
            await vscode.commands.executeCommand(cmd);
        }),
        
        // KP8: Section Viewport Bottom / Viewport Top Jump
        vscode.commands.registerCommand('edtKeypad.kp8', async () => {
            checkGold();
            if (isSelectionModeActive) {
                const cmd = (currentDirection === 'advance') ? 'cursorPageDownSelect' : 'cursorPageUpSelect';
                await vscode.commands.executeCommand(cmd);
            } else {
                const cmd = (currentDirection === 'advance') ? 'cursorPageDown' : 'cursorPageUp';
                await vscode.commands.executeCommand(cmd);
            }
        }),
        
        // KP9: Open text line break row below active cursor positions
        vscode.commands.registerCommand('edtKeypad.kp9', async () => {
            checkGold();
            await vscode.commands.executeCommand('editor.action.insertLineAfter');
        }),
        
        // KP- (Subtract): Continuous Line-Join Delete with Clipboard Sync / Gold Uncut
        vscode.commands.registerCommand('edtKeypad.kpsub', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            if (checkGold()) {
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                return;
            }
            const position = editor.selection.active;
            const currentLine = editor.document.lineAt(position.line);
            const remainingTextRange = new vscode.Range(position, currentLine.range.end);
            let textToCut = editor.document.getText(remainingTextRange);
            if (position.line < editor.document.lineCount - 1) {
                textToCut += '\n'; // Keep the trailing structural return character
            }
            await vscode.env.clipboard.writeText(textToCut);
            await vscode.commands.executeCommand('deleteAllRight');
            if (position.line < editor.document.lineCount - 1) {
                await vscode.commands.executeCommand('deleteRight');
            }
        }),
        
        // KP, (Add): Delete current character rightward (with clipboard capture)
        // Gold + KP, (Add): Paste back what was just deleted (Undo character cut)
        vscode.commands.registerCommand('edtKeypad.kpadd', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            if (checkGold()) {
                // Gold Sequence: Paste the deleted content back into the editor
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                return;
            }
            // Normal Sequence: Capture the single character to the right of the cursor
            const position = editor.selection.active;
            const currentLine = editor.document.lineAt(position.line);
            // Ensure we aren't already at the absolute end of the file line
            if (position.character < currentLine.range.end.character) {
                const charRange = new vscode.Range(position, position.translate(0, 1));
                const charToCut = editor.document.getText(charRange);
                // 1. Write the character to the system clipboard
                await vscode.env.clipboard.writeText(charToCut);
                // 2. Perform the rightward deletion
                await vscode.commands.executeCommand('deleteRight');
            } else if (position.line < editor.document.lineCount - 1) {
                // If at the end of the line, capture the newline character instead
                await vscode.env.clipboard.writeText('\n');
                await vscode.commands.executeCommand('deleteRight');
            }
        }),
        
        // Ctrl + KP+ (Add): Delete Next Word Right (With Clipboard Sync Capture)
        // Gold + Ctrl + KP+ (Add): Paste back word AND keep cursor at the START of the paste
        vscode.commands.registerCommand('edtKeypad.ctrladd', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            // Check if Gold Key (PF1) was pressed immediately before this chord
            if (checkGold()) {
                // Read the last cut word directly from the system clipboard memory
                const clipboardText = await vscode.env.clipboard.readText();
                if (!clipboardText) return;
                const startPosition = editor.selection.active;
                // 1. Inject the text at the current cursor position
                await editor.edit(editBuilder => {
                    editBuilder.insert(startPosition, clipboardText);
                });
                // 2. Force the cursor to stay exactly where the paste started
                const fixedSelection = new vscode.Selection(startPosition, startPosition);
                editor.selection = fixedSelection;
                return;
            }
            // Normal Sequence: Continuous word capture macro execution
            //const position = editor.selection.active;
            // Highlight the next word rightward to evaluate its string data properties
            await vscode.commands.executeCommand('cursorWordEndRightSelect');
            const selection = editor.selection;
            const wordToCut = editor.document.getText(selection);
            if (wordToCut.length > 0) {
                // Synchronize target data block with your system clipboard memory register
                await vscode.env.clipboard.writeText(wordToCut);
                // Clear text fields entirely via localized deletion vectors
                await vscode.commands.executeCommand('deleteLeft');
            }
        }),
        
        // KP. (Decimal): Toggle Selection Mode (First press sets anchor, second press cancels it)
        // Gold + KP. (Decimal): Legacy fallback (also clears selection)
        vscode.commands.registerCommand('edtKeypad.kpdot', async () => {
            // If Gold Key is active, OR if Selection Mode is already running, cancel it
            if (checkGold() || isSelectionModeActive) {
                isSelectionModeActive = false;
                await vscode.commands.executeCommand('cancelSelection');
                vscode.window.setStatusBarMessage('EDT: Selection Cleared', 2000);
                return;
            }
            // First press: Activate selection state anchoring
            isSelectionModeActive = true;
            await vscode.commands.executeCommand('editor.action.setSelectionAnchor');
            vscode.window.setStatusBarMessage('EDT: Selection Mode Anchored', 2000);
        }),
        
        // KPE (Enter): Line insertion execution
        vscode.commands.registerCommand('edtKeypad.kpenter', async () => {
            checkGold();
            await vscode.commands.executeCommand('editor.action.insertLineAfter');
        }),
        
        // PF3 (Keypad Multiply): Intelligent Search Focus & Navigation / Gold Replace
        vscode.commands.registerCommand('edtKeypad.pf3', async () => {
            if (checkGold()) {
                // Gold Sequence: Open the Search and Replace UI panel
                await vscode.commands.executeCommand('editor.action.startFindReplaceAction');
                return;
            }
            // Normal Sequence: Contextual checking of the Find Widget state
            // If the Find search overlay widget is ALREADY visible and focused, skip to next match
            // Otherwise, initialize the Find bar window and force keyboard input focus into it
            await vscode.commands.executeCommand('actions.find');
        }),
        
        // Safety command interface binder targeting palette lookup indexes
        vscode.commands.registerCommand('edtKeypad.wake', () => {
            vscode.window.showInformationMessage('EDT Keypad Core Active!');
        })
    );
}

export function deactivate(): void {
}

function initMarkMode(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand(
        'emacs.enterMarkMode', () => {
            if (inMarkMode && !markHasMoved) {
                inMarkMode = false;
            } else {
                initSelection();
                inMarkMode = true;
                markHasMoved = false;
            }
        })
    );

    context.subscriptions.push(vscode.commands.registerCommand(
        'emacs.exitMarkMode', () => {
            const selections = vscode.window.activeTextEditor.selections;
            const hasMultipleSelecitons = selections.length > 1;
            if (hasMultipleSelecitons) {
                const allSelectionsAreEmpty = selections.every(selection => selection.isEmpty);
                if (allSelectionsAreEmpty) {
                    vscode.commands.executeCommand("removeSecondaryCursors");
                } else {
                    // initSelection() is used here instead of `executeCommand("cancelSelection")`
                    // because `cancelSelection` command not only cancels selection state
                    // but also removes secondary cursors though these should remain in this case.
                    initSelection();
                }
            } else {
                // This `executeCommand("cancelSelection")` may be able to be replaced with `initSelection()`,
                // however, the core command is used here to follow its updates with ease.
                vscode.commands.executeCommand("cancelSelection");
            }

            if (inMarkMode) {
                inMarkMode = false;
            }
        })
    );
}

function registerCommand(commandName: string, op: Operation): vscode.Disposable {
    return vscode.commands.registerCommand("emacs." + commandName, op.getCommand(commandName));
}

function initSelection(): void {
    // Set new `anchor` and `active` values to all selections so that these are initialized to be empty.
    vscode.window.activeTextEditor.selections = vscode.window.activeTextEditor.selections.map(selection => {
        const currentPosition: vscode.Position = selection.active;
        return new vscode.Selection(currentPosition, currentPosition);
    });
}

function updateStatusBar() {
    if (isGoldActive) {
        statusBarItem.text = `$(star-full) EDT: GOLD`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
        statusBarItem.text = `$(arrow-both) EDT: ${currentDirection.toUpperCase()}`;
        statusBarItem.backgroundColor = undefined;
    }
}
