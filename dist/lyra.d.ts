/**
 * Lyra の設定情報
 */
export interface LyraConfig {
    /**
     * Lyra の WebAssembly ビルドファイルが配置されているディレクトリのパス（URL）
     */
    wasmPath: string;
    /**
     * Lyra のモデルファイルが配置されているディレクトリのパス（URL）
     */
    modelPath: string;
}
/**
 * Lyra の初期化を行うメソッド
 *
 * このメソッドの呼び出し時には設定情報の保存のみを行い、
 * Lyra での音声エンコード・デコードに必要な WebAssembly ファイルおよびモデルファイルは、
 * 実際に必要になったタイミングで初めてロードされます
 *
 * Lyra を使うためには以下の機能がブラウザで利用可能である必要があります:
 * - クロスオリジン分離（内部で SharedArrayBuffer クラスを使用しているため）
 * - WebRTC Encoded Transform
 *
 * これらの機能が利用不可の場合には、このメソッドは警告メッセージを出力した上で、
 * 返り値として false を返します
 *
 * @param config Lyra の設定情報
 * @returns Lyra の初期化に成功したかどうか
 *
 * @public
 */
export declare function initLyra(config: LyraConfig): boolean;
