import {Bignum} from '../../utilities/bignum';
import {VLIE} from '../../crypto/vlie';
import {BaseFrame, FrameType} from '../base.frame';



export class MaxDataFrame extends BaseFrame {
    private maxData: Bignum;

    public constructor(maxData: Bignum) {
        super(FrameType.MAX_DATA);
        this.maxData = maxData;
    }

    public toBuffer(): Buffer {
        var maxDataBuffer: Buffer = VLIE.encode(this.maxData);
        var returnBuffer: Buffer = Buffer.alloc(maxDataBuffer.byteLength + 1);
        returnBuffer.writeUInt8(this.getType(), 0);
        maxDataBuffer.copy(returnBuffer, 1);
        return returnBuffer;
    }
}